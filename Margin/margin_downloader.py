import requests 
import json 
import datetime
import pandas as pd
import concurrent.futures
import time
from typing import List, Dict, Any
import logging
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('margin_download.log'),
        logging.StreamHandler()
    ]
)

class MarginDownloader:
    def __init__(self, api_key: str):
        self.url_base = "https://api.developer.deutsche-boerse.com/prod/prisma-margin-estimator-2-0/2.0.0/"
        self.api_header = {"X-DBP-APIKEY": api_key}
        self.session = self._create_session()

    def _create_session(self) -> requests.Session:
        """Create a session with retry mechanism and proper connection pooling"""
        session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504]
        )
        # Increase max pool size and configure connection pooling
        adapter = HTTPAdapter(
            max_retries=retry_strategy,
            pool_connections=25,  # Base pool size
            pool_maxsize=25,      # Max pool size
            pool_block=True       # Block when pool is full instead of discarding
        )
        session.mount("https://", adapter)
        return session

    def get_series(self, product: str = 'ODAX') -> Dict[str, Any]:
        """
        Fetch series data for a given financial product from the Deutsche Börse API.

        Args:
            product (str, optional): The product symbol to query for option or future series. 
                                     Defaults to 'ODAX'.

        Returns:
            Dict[str, Any]: The parsed JSON response from the API. Typical keys include 'list_series',
                            which contains a list of series dictionaries, but the exact structure
                            depends on the API response.

        Raises:
            requests.exceptions.RequestException: If an HTTP or connection error occurs during the request.

        Explanation:
            - Makes an HTTP GET request to the /series endpoint with the specified product code.
            - Uses pre-configured session and authentication headers.
            - If the response is successful, the JSON content is returned as a Python dictionary.
            - If an exception occurs (connection error, timeout, HTTP error, etc.), 
              it logs the error and re-raises the exception for the caller to handle.
        """
        try:
            response = self.session.get(
                f"{self.url_base}series",
                params={'products': product},
                headers=self.api_header,
                timeout=10
            )
            response.raise_for_status()  # Raises HTTPError for bad responses
            return response.json()      # Returns a dictionary of the response payload
        except requests.exceptions.RequestException as e:
            logging.error(f"Error fetching series data: {e}")
            raise

    def call_margin_api(self, etd: Dict[str, Any]) -> Dict[str, Any]:
        """Call margin API for a single ETD with enhanced error handling and rate limiting"""
        max_retries = 3
        retry_delay = 2  # seconds
        
        for attempt in range(max_retries):
            try:
                response = self.session.post(
                    f"{self.url_base}estimator",
                    headers=self.api_header,
                    json={
                        'portfolio_components': [
                            {'type': 'etd_portfolio', 'etd_portfolio': [etd]}
                        ],
                        'clearing_currency': 'EUR'
                    },
                    timeout=10
                )
                
                # Log raw response for debugging if needed
                if response.status_code != 200:
                    logging.error(f"API error for ETD {etd['iid']}: Status {response.status_code}, Response: {response.text}")
                    if attempt < max_retries - 1:
                        time.sleep(retry_delay * (attempt + 1))
                        continue
                    return None
                
                try:
                    result = response.json()
                except json.JSONDecodeError as je:
                    logging.error(f"JSON decode error for ETD {etd['iid']}: {je}. Raw response: {response.text[:200]}...")
                    if attempt < max_retries - 1:
                        time.sleep(retry_delay * (attempt + 1))
                        continue
                    return None
                
                return {
                    'iid': etd['iid'],
                    'initial_margin': result['portfolio_margin'][0]['initial_margin'],
                    'component_margin': result['drilldowns'][0]['component_margin'],
                    'premium_margin': result['drilldowns'][0]['premium_margin']
                }
                
            except requests.exceptions.RequestException as e:
                logging.error(f"Request error for ETD {etd['iid']} (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay * (attempt + 1))
                    continue
                return None
            except (KeyError, IndexError) as e:
                logging.error(f"Data structure error for ETD {etd['iid']}: {e}")
                return None

    def process_etds(self, etd_list: List[Dict[str, Any]], max_workers: int = 15) -> List[Dict[str, Any]]:
        """Process ETDs with highly optimized parallel execution and dynamic chunking"""
        result_list = []
        initial_chunk_size = 100
        max_chunk_size = 200
        min_chunk_size = 50
        current_chunk_size = initial_chunk_size
        
        # Performance tracking
        success_count = 0
        total_count = 0
        moving_avg_success_rate = 1.0
        alpha = 0.3  # Weight for moving average
        
        # Group ETDs by contract date for better caching
        etd_list.sort(key=lambda x: x['iid'])
        
        def process_chunk(chunk):
            nonlocal success_count, total_count
            chunk_results = []
            chunk_futures = []
            
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Submit all requests quickly
                for etd in chunk:
                    future = executor.submit(self.call_margin_api, etd)
                    chunk_futures.append(future)
                
                # Collect results as they complete
                for future in concurrent.futures.as_completed(chunk_futures):
                    result = future.result()
                    total_count += 1
                    if result:
                        success_count += 1
                        chunk_results.append(result)
            
            return chunk_results
        
        total_items = len(etd_list)
        items_processed = 0
        start_total = time.time()
        
        while items_processed < total_items:
            chunk = etd_list[items_processed:items_processed + current_chunk_size]
            chunk_start = time.time()
            
            # Process current chunk
            logging.info(f"Processing items {items_processed}-{items_processed + len(chunk)} of {total_items} "
                        f"(chunk size: {current_chunk_size})")
            
            chunk_results = process_chunk(chunk)
            result_list.extend(chunk_results)
            
            # Calculate metrics
            chunk_time = time.time() - chunk_start
            chunk_success_rate = len(chunk_results) / len(chunk)
            moving_avg_success_rate = (alpha * chunk_success_rate + 
                                     (1 - alpha) * moving_avg_success_rate)
            
            # Dynamic chunk size adjustment
            if moving_avg_success_rate > 0.95 and chunk_time < 2.0:
                current_chunk_size = min(max_chunk_size, 
                                       int(current_chunk_size * 1.2))
            elif moving_avg_success_rate < 0.8 or chunk_time > 5.0:
                current_chunk_size = max(min_chunk_size, 
                                       int(current_chunk_size * 0.8))
            
            # Adaptive delay
            if moving_avg_success_rate > 0.9:
                delay = max(0.1, 1.0 - chunk_time/len(chunk))
            else:
                delay = max(0.5, 2.0 - chunk_time/len(chunk))
            
            items_processed += len(chunk)
            progress = items_processed / total_items * 100
            
            logging.info(f"Progress: {progress:.1f}% | Success rate: {moving_avg_success_rate:.2%} | "
                        f"Chunk time: {chunk_time:.2f}s | Items/sec: {len(chunk)/chunk_time:.1f}")
            
            if items_processed < total_items:
                time.sleep(delay)
        
        total_time = time.time() - start_total
        logging.info(f"Completed in {total_time:.1f}s | Average speed: {total_items/total_time:.1f} items/sec | "
                    f"Final success rate: {success_count/total_count:.2%}")
        
        return result_list

def main():
    try:
        # Initialize downloader
        api_key = "d73a57e8-de0f-44a9-9c5b-819049743ba6"
        downloader = MarginDownloader(api_key)
        
        # Get series data
        logging.info("Fetching series data...")
        series = downloader.get_series()
        
        # Prepare ETD list
        etd_list = [
            {'line_no': 1, 'iid': product['iid'], 'net_ls_balance': -1}
            for product in series['list_series']
        ]
        
        logging.info(f"Found {len(etd_list)} ODAX products")
        
        # Process ETDs
        logging.info("Starting margin calculation...")
        result_list = downloader.process_etds(etd_list)
        
        # Convert to DataFrames
        data_odax = pd.json_normalize(series, record_path=['list_series'])
        margin_result = pd.DataFrame(result_list)
        
        # Merge results
        merged_result = data_odax.merge(margin_result, on="iid")
        
        # Sort and select columns exactly as in original
        merged_result = merged_result.sort_values(
            by=['call_put_flag', 'contract_date', 'exercise_price']
        )
        merged_result = merged_result[[
            "contract_date",
            "call_put_flag",
            "exercise_price",
            "initial_margin",
            "premium_margin"
        ]]
        
        # Save results with original filename
        merged_result.to_csv("Margin_Result.txt", sep="\t", index=False, header=True)
        logging.info("Results saved to Margin_Result.txt")
        
    except Exception as e:
        logging.error(f"An error occurred: {e}", exc_info=True)

if __name__ == "__main__":
    main()