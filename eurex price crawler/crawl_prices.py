from playwright.sync_api import sync_playwright
import time
from datetime import datetime
import pandas as pd
import os
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from options_pipeline.db_ingest import upsert_snapshots
from dotenv import load_dotenv
import pytz
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np

def get_contract_info_old(page): # Returns "monthly" also for contract_date - not working!
    # Find the selected date button (not the Monthly/Weekly selector)
    selected_date_btn = page.query_selector("div._filter_contract_date_container_1y9l5_7 button._filterButton_15sg6_42._selected_15sg6_67")
    if not selected_date_btn:
        return None, None
    
    contract_date = selected_date_btn.inner_text()  # This will get "19.09.2025" etc.
    contract_type = 'monthly' if '_monthly_15sg6_63' in selected_date_btn.get_attribute('class') else 'weekly'
    return contract_date, contract_type

def get_contract_info(page):
    # Get all selected buttons - there will always be 2: Monthly/Weekly toggle + date
    selected_buttons = page.query_selector_all("button._filterButton_15sg6_42._selected_15sg6_67")
    
    if len(selected_buttons) < 2:
        return None, None
    
    # Second button is always the date button
    date_btn = selected_buttons[1]
    contract_date = date_btn.inner_text()
    contract_type = 'monthly' if '_monthly_15sg6_63' in date_btn.get_attribute('class') else 'weekly'
    
    return contract_date, contract_type

def fast_click_down(page, num_clicks):
    arrow = page.query_selector("._arrow_bottom_1htfc_42")
    if not arrow or not arrow.is_visible():
        return False
        
    for _ in range(num_clicks):
        if not arrow.is_visible():
            return False
        arrow.click()
    # Remove sleep entirely - let the page handle its own timing
    return True

def scroll_to_top_with_wheel(page):
    """Scroll back to top using mouse wheel"""
    container = page.query_selector("div._scrollable_table_container_1htfc_71[data-scroll-disabled='forward']")
    if container:
        container.hover()
        for _ in range(50):  # Repeat 10 times
            page.mouse.wheel(0, -500000)
            time.sleep(0.1)  # Wait between scrolls
        # # Scroll up a large amount to ensure we're at top
        # page.mouse.wheel(0, -5000000)
        # time.sleep(0.1)

# def scroll_to_top(page):
#     """Scroll both tables back to the top using JavaScript"""
#     page.evaluate("""
#         // Scroll both scrollable containers to top
#         const containers = document.querySelectorAll('._scrollable_table_container_1htfc_71');
#         containers.forEach(container => {
#             container.scrollTop = 0;
#         });
#     """)
#     time.sleep(0.1)  # Brief pause for UI to update

def scroll_up(page, num_clicks):
    """Scroll up by clicking the up arrow num_clicks times"""
    up_arrow = page.query_selector("._arrow_top_1htfc_35")
    if not up_arrow:
        return
    
    for _ in range(num_clicks):
        if not up_arrow.is_visible():
            break
        up_arrow.click()
    time.sleep(0.1)  # Brief pause after scrolling back


def scroll_to_top_old(page):
    """Scroll both tables back to the top"""
    # Click the up arrow multiple times to go back to top
    up_arrow = page.query_selector("._arrow_top_1htfc_35")
#    _arrow_1htfc_32 _arrow_top_1htfc_35
    if up_arrow and up_arrow.is_visible():
        # Click many times to ensure we're at the top
        for _ in range(300):  # Generous number to reach top
            if not up_arrow.is_visible():
                break
            up_arrow.click()
            time.sleep(0.01)  # Small delay


def scrape_single_expiry(expiry_date, scrape_date, scrape_time):
    """Scrape one expiry date in its own browser"""
    print(f"Starting scrape for {expiry_date}...")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--disable-blink-features=AutomationControlled'])
        page = browser.new_page()
        page.set_default_timeout(10000)
        
        page.goto("https://www.eurex.com/ex-de/maerkte/idx/dax/DAX-Optionen-141164", wait_until="domcontentloaded")
        page.evaluate("document.body.style.zoom = '0.5'")
        
        # Dismiss cookie banner
        try:
            cookie_reject = page.wait_for_selector("#cookiescript_reject", timeout=2000)
            if cookie_reject:
                cookie_reject.click()
        except:
            pass
        
        page.wait_for_selector("table.react-table", timeout=10000)
        
        # Click the button for this specific expiry date
        date_buttons = page.query_selector_all("div._filter_contract_date_container_1y9l5_7 button._filterButton_15sg6_42")
        for button in date_buttons:
            if button.inner_text() == expiry_date:
                button.click()
                page.wait_for_selector("table.react-table", timeout=10000)
                time.sleep(0.2)
                break
        
        # Scrape this expiry date
        all_data = []
        seen_strikes = set()
        scrape_contract_date(page, all_data, seen_strikes, scrape_date, scrape_time)
        
        browser.close()
        
        print(f"Finished scraping {expiry_date}: {len(all_data)} rows")
        
        # Write to database immediately
        if all_data:
            headers = ['date', 'time', 'contract_date', 'monthly_weekly', 'option_type', 'strike', 
                      'last_trade', 'open', 'high', 'low', 'daily_settlement', 
                      'open_interest', 'volume', 'last_price', 'bid', 'ask']
            df = pd.DataFrame(all_data, columns=headers)
            df = df.replace({np.nan: None})
            
            try:
                upsert_snapshots(df)
                print(f"✅ Saved {expiry_date} to database")
            except Exception as e:
                print(f"❌ Error saving {expiry_date} to database: {e}")

        return len(all_data)


def get_visible_data(page):
    # New
    strikes = []
    strike_cells = page.query_selector_all("._stroke_cell_1xods_68")
    for cell in strike_cells:
        strike = cell.inner_text()
        if strike:
            # German format: remove thousand separator (.) and replace decimal comma with dot
            #strike = strike.replace('.', '').replace(',', '.')
            strike = strike.replace('.', '').split(',')[0]
            strikes.append(strike)

    calls = []
    call_rows = page.query_selector_all("div._scrollable_table_container_1htfc_71[data-scroll-disabled='forward'] tbody tr")
    for row in call_rows:
        cells = row.query_selector_all("td")

        if cells and len(cells) >= 11:
#        if cells and len(cells) > 0:
            #row_data = [cell.inner_text() for cell in cells]
            row_data = [cells[i].inner_text() for i in range(1, 11)]
            if any(row_data):
                calls.append(row_data)
    
    # puts = []
    # put_rows = page.query_selector_all("div._scrollable_table_container_1htfc_71[data-scroll-disabled='back'] tbody tr")
    # for row in put_rows:
    #     cells = row.query_selector_all("td")
    #     if cells and len(cells) > 0:
    #         row_data = [cell.inner_text() for cell in cells]
    #         if any(row_data):
    #             # REVERSE the order for puts since columns are backwards
    #             puts.append(row_data[::-1])

    puts = []
    put_rows = page.query_selector_all("div._scrollable_table_container_1htfc_71[data-scroll-disabled='back'] tbody tr")
    for row in put_rows:
        cells = row.query_selector_all("td")
        if cells and len(cells) >= 11:
            # Reorder PUTS to match CALLS: skip index 0, then map indices
            # PUTS: 0(skip), 1=Bid, 2=Ask, 3=LastPrice, 4=Volume, 5=OI, 6=DailySettlement, 7=Open, 8=High, 9=Low, 10=LastTrade
            # Want: LastTrade, Open, High, Low, DailySettlement, OI, Volume, LastPrice, Bid, Ask
            reordered = [
                cells[10].inner_text(),  # Letzter Trade
                cells[7].inner_text(),   # Eröffnung
                cells[8].inner_text(),   # Hoch
                cells[9].inner_text(),   # Tief
                cells[6].inner_text(),   # Tägl. Abrechnungspreis
                cells[5].inner_text(),   # Open Interest
                cells[4].inner_text(),   # Volume
                cells[3].inner_text(),   # Letzter Preis
                cells[1].inner_text(),   # Geldkurs (Bid)
                cells[2].inner_text(),   # Briefkurs (Ask)
            ]
            if any(reordered):
                puts.append(reordered)
    
    return strikes, calls, puts

def process_rows(strikes, calls, puts, all_data, seen_strikes, scrape_date, scrape_time, contract_date, contract_type):
    #print(f"Processing {len(strikes)} strikes, {len(calls)} calls, {len(puts)} puts")
    for i, strike in enumerate(strikes):
        strike_key = f"{strike}-{contract_date}"
        if strike_key not in seen_strikes:
            seen_strikes.add(strike_key)
            
            if i < len(calls):
                row_data = calls[i]
                all_data.append([scrape_date, scrape_time, contract_date, contract_type, 'CALL', strike] + row_data)
            
            if i < len(puts):
                row_data = puts[i]
                all_data.append([scrape_date, scrape_time, contract_date, contract_type, 'PUT', strike] + row_data)

def scrape_contract_date(page, all_data, seen_strikes, scrape_date, scrape_time):
    contract_date, contract_type = get_contract_info(page)
    if not contract_date:
        print("Warning: Could not detect contract date!")
        return 0  # Return 0 clicks performed

    total_clicks = 0  # Track total down clicks

    # Get initial data
    initial_strikes, initial_calls, initial_puts = get_visible_data(page)
    if initial_strikes and (initial_calls or initial_puts):
        process_rows(initial_strikes, initial_calls, initial_puts, all_data, seen_strikes, 
                    scrape_date, scrape_time, contract_date, contract_type)
        
    
    # Scroll and get rest of data - optimized scrolling
    consecutive_failures = 0
    max_failures = 3
    
    while consecutive_failures < max_failures:
        # Scroll by smaller chunks for faster processing
        scroll_size = min(len(initial_strikes), 15)  # Max 10 rows at a time
        clicked = fast_click_down(page, scroll_size)
        if clicked:
            total_clicks += scroll_size
        else:
            # Arrow disappeared - get final data before stopping
            strikes, calls, puts = get_visible_data(page)
            if strikes and (calls or puts):
                process_rows(strikes, calls, puts, all_data, seen_strikes, 
                           scrape_date, scrape_time, contract_date, contract_type)
            consecutive_failures += 1
            continue
            
        strikes, calls, puts = get_visible_data(page)
        if strikes and (calls or puts):
            process_rows(strikes, calls, puts, all_data, seen_strikes, 
                       scrape_date, scrape_time, contract_date, contract_type)
            consecutive_failures = 0
        else:
            consecutive_failures += 1
        
    
    return total_clicks  # Return number of clicks to reverse

        # if not fast_click_down(page, scroll_size):
        #     strikes, calls, puts = get_visible_data(page)
        #     if strikes and (calls or puts):
        #         process_rows(strikes, calls, puts, all_data, seen_strikes, 
        #                    scrape_date, scrape_time, contract_date, contract_type)
        #     consecutive_failures += 1
        #     continue
            
        # strikes, calls, puts = get_visible_data(page)
        # if strikes and (calls or puts):
        #     process_rows(strikes, calls, puts, all_data, seen_strikes, 
        #                scrape_date, scrape_time, contract_date, contract_type)
        #     consecutive_failures = 0  # Reset on success
        # else:
        #     consecutive_failures += 1


def scrape_options_data():
    start_time = time.time()
    berlin_tz = pytz.timezone('Europe/Berlin')
    now = datetime.now(berlin_tz)
    scrape_date = now.strftime('%Y-%m-%d')
    scrape_time = now.strftime('%H:%M')
    
    print(f"Starting parallel scrape at {scrape_time} on {scrape_date}...")
    
    # First, get list of all expiry dates
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("https://www.eurex.com/ex-de/maerkte/idx/dax/DAX-Optionen-141164", wait_until="domcontentloaded")
        page.evaluate("document.body.style.zoom = '0.5'")
        
        try:
            cookie_reject = page.wait_for_selector("#cookiescript_reject", timeout=2000)
            if cookie_reject:
                cookie_reject.click()
        except:
            pass
        
        page.wait_for_selector("table.react-table", timeout=10000)
        
        # Click "Show more" button
        try:
            show_more = page.query_selector("button._showMoreLessButton_15sg6_121")
            if show_more and "Show more" in show_more.inner_text():
                show_more.click()
                time.sleep(0.3)
        except:
            pass
        
        # Get all expiry dates
        date_buttons = page.query_selector_all("div._filter_contract_date_container_1y9l5_7 button._filterButton_15sg6_42")
        expiry_dates = []
        print("Found date buttons: ")
        for button in date_buttons:
            # Skip Monthly/Weekly toggle buttons
            text = button.inner_text()
            if text and text not in ['Monthly', 'Weekly']:
                expiry_dates.append(text)

        browser.close()
    
    print(f"Found {len(expiry_dates)} expiry dates: {expiry_dates}")
    
    # Scrape all expiry dates in parallel (limit to 3 at a time to not overwhelm)
    #all_data = []
    total_rows = 0
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {executor.submit(scrape_single_expiry, date, scrape_date, scrape_time): date 
                   for date in expiry_dates}  # [:5] would limit to first 5 for testing
        
        for future in as_completed(futures):
            expiry_date = futures[future]
            try:
                # data = future.result()
                # all_data.extend(data)
                row_count = future.result()
                total_rows += row_count
            except Exception as e:
                print(f"❌ Error scraping {expiry_date}: {e}")
    
    # # Create DataFrame and save
    # headers = ['date', 'time', 'contract_date', 'monthly_weekly', 'option_type', 'strike', 
    #           'last_trade', 'open', 'high', 'low', 'daily_settlement', 
    #           'open_interest', 'volume', 'last_price', 'bid', 'ask']
    
    # df = pd.DataFrame(all_data, columns=headers)
    # df = df.replace({np.nan: None})
    
    # # Save to database
    # upsert_snapshots(df)
    
    # Save to files
    # ... your existing file saving code ...
            
    #folder_path = "daxtest/prices/output"
    # Ensure output directory exists
    #os.makedirs(folder_path, exist_ok=True)
    #filename_base = f"Eurex_prices_{scrape_date.replace('-', '')}_{scrape_time.replace(':', '')}"
    #df.to_excel(f"{folder_path}/{filename_base}.xlsx", index=False)

    
    end_time = time.time()
    elapsed = end_time - start_time

    print(f"\n✅ Total: {total_rows} rows in {int(elapsed//60)}m {int(elapsed%60)}s")
    
    return total_rows
    # print(f"✅ Scraped {len(all_data)} total rows in {int(elapsed//60)}m {int(elapsed%60)}s")
    
    # return all_data, df



def scrape_options_data_single():
    
    start_time = time.time()  # Start timing
    now = datetime.now(pytz.timezone('Europe/Berlin'))
    scrape_date = now.strftime('%Y-%m-%d')
    scrape_time = now.strftime('%H:%M')
    
    print(f"Starting normal scrape at {scrape_time} on {scrape_date}...")
    
    with sync_playwright() as p:
        # Launch browser with performance optimizations
        browser = p.chromium.launch(
            headless=False,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-gpu',
                '--disable-extensions'
            ]
        )
        page = browser.new_page()
        # Set faster timeouts
        page.set_default_timeout(10000)  # 10 seconds default
        
        # Navigate faster with reduced timeout
        page.goto("https://www.eurex.com/ex-de/maerkte/idx/dax/DAX-Optionen-141164", wait_until="domcontentloaded")
        page.evaluate("document.body.style.zoom = '0.5'")
        
        # Handle cookie banner with shorter timeout
        try:
            cookie_reject = page.wait_for_selector("#cookiescript_reject", timeout=2000)
            if cookie_reject:
                cookie_reject.click()
                print("Cookie banner dismissed")
        except:
            print("No cookie banner found or already dismissed")

        
        try:
            show_more = page.query_selector("button._showMoreLessButton_15sg6_121")
            if show_more and "Show more" in show_more.inner_text():
                show_more.click()
                time.sleep(0.3)
        except:
            pass

        # Wait for essential elements with shorter timeout
        page.wait_for_selector("table.react-table", timeout=10000)
        for attempt in range(2):
            try:
                page.wait_for_selector("button._filterButton_15sg6_42._selected_15sg6_67", timeout=5000)
                break
            except Exception as e:
                print("❌ Page is not loading, retrying page load...")
                # Reload the whole page and try again, from goto
                page.goto("https://www.eurex.com/ex-de/maerkte/idx/dax/DAX-Optionen-141164", wait_until="domcontentloaded")
                page.evaluate("document.body.style.zoom = '0.5'")


                try:
                    cookie_reject = page.wait_for_selector("#cookiescript_reject", timeout=2000)
                    if cookie_reject:
                        cookie_reject.click()
                        print("Cookie banner dismissed")
                except:
                    print("No cookie banner found or already dismissed")

                try:
                    show_more = page.query_selector("button._showMoreLessButton_15sg6_121")
                    if show_more and "Show more" in show_more.inner_text():
                        show_more.click()
                        time.sleep(0.3)
                except:
                    pass


                page.wait_for_selector("table.react-table", timeout=10000)
        else:
            raise Exception("Could not find contract button after reload")
        
        all_data = []
        
        # Get all contract date buttons
        # TBD: First click on "more", otherwise it shows only first couple of months
        date_buttons = page.query_selector_all("div._filter_contract_date_container_1y9l5_7 button._filterButton_15sg6_42")
        print(f"Found {len(date_buttons)} date buttons: ")
        for button in date_buttons:
            print(button.inner_text())
        
        # First scrape the initially selected date
        seen_strikes = set()
        #scrape_contract_date(page, all_data, seen_strikes, scrape_date, scrape_time)
        #scroll_to_top(page)

        #clicks_down = scrape_contract_date(page, all_data, seen_strikes, scrape_date, scrape_time)
        #scroll_up(page, clicks_down)  # Scroll back up exact amount

        scrape_contract_date(page, all_data, seen_strikes, scrape_date, scrape_time)
        #scroll_to_top(page)



        # Then iterate through other date buttons (limited to first 2 for testing)
        buttons_processed = 0
        for button in date_buttons:
            # Skip if it's already selected
            if '_selected_15sg6_67' in button.get_attribute('class'):
                continue
            
            # Limit to first 2 buttons for testing
            if buttons_processed >= 1:  # 1 because we already processed the initially selected one
                break
                
            button.click()
            # Wait for table to update with shorter timeout
            page.wait_for_selector("table.react-table", timeout=10000)
            # Small delay to ensure data is loaded
            time.sleep(0.1)

            seen_strikes = set()
            scrape_contract_date(page, all_data, seen_strikes, scrape_date, scrape_time)
            scroll_to_top_with_wheel(page)  # Reset to top after each expiry date
            #scroll_up(page, clicks_down)
            buttons_processed += 1
        
        browser.close()
        
        headers = ['date', 'time', 'contract_date', 'monthly_weekly', 'option_type', 'strike', 
                  #'contract_type', 'last_trade', 'open', 'high', 'low', 'daily_settlement',
                  'last_trade', 'open', 'high', 'low', 'daily_settlement', 
                  'open_interest', 'volume', 'last_price', 'bid', 'ask']
        
        df = pd.DataFrame(all_data, columns=headers)

        import numpy as np

        # Clean up any NaN/NaT before writing to Postgres JSON fields
        df = df.replace({np.nan: None})
        # DATABASE CONNECTION
        upsert_snapshots(df)


        ############
        
        output_txt = ['\t'.join(headers)]
        for row in all_data:
            output_txt.append('\t'.join(str(x) for x in row))
            
        folder_path = "daxtest/prices/output"
        # Ensure output directory exists
        os.makedirs(folder_path, exist_ok=True)
        filename_base = f"Eurex_prices_{scrape_date.replace('-', '')}_{scrape_time.replace(':', '')}"
        df.to_excel(f"{folder_path}/{filename_base}.xlsx", index=False)
        
        with open(f"{folder_path}/{filename_base}.txt", 'w', encoding='utf-8') as f:
            f.write('\n'.join(output_txt))
            
        # Calculate and display timing
        end_time = time.time()
        elapsed_time = end_time - start_time
        minutes = int(elapsed_time // 60)
        seconds = int(elapsed_time % 60)
        
        print(f"\nSaved data to {folder_path}/{filename_base}.txt and {folder_path}/{filename_base}.xlsx")
        print(f"Total rows scraped: {len(all_data)}")
        print(f"Unique strikes processed: {len(seen_strikes)}")
        print(f"⏱️ Scraping completed in {minutes}m {seconds}s ({elapsed_time:.2f} seconds total)")
        
        return output_txt, df

if __name__ == "__main__":
    
    load_dotenv()
    print("Starting scraping...")
    rows = scrape_options_data()
    print(f"Total rows scraped: {rows}")
#    data, df = scrape_options_data()