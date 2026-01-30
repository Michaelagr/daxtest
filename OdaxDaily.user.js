// ==UserScript==
// @name           OdaxDaily
// @namespace      kr
// @version        2025
// @description    load eurex Prices/Quotes for odax

// @include	https://www.eurex.com/ex-de/maerkte/idx/dax/DAX-Optionen-141164*
// @include	https://www.eurex.com/ex-en/markets/idx/dax/DAX-Options-139884*
// @include	file:///C:/Download/Alist%20(1).html
// @grant 		GM_setClipboard
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       window.close

// ==/UserScript==

//global data
var flagHTML = 1;//0: get .odx file   1:get .html file  //xxx

var expirationmode = 0;
var state = 0;
var stateold;
var productDateString = '';
var delay;
var row0, row1;
var productDateList = [];
var productDateIndex = 0;
var productDate;
var x;
var text;
var offsetweekly;

var statearrowup;
var laststrike;
var callline;
var putline;
var doneflag = 0;;
var strike;

var strikeMin;
var strikeMax;
var count;
var contracttype;

var handelstag;
var handelszeit;
var header;
var listerror = 0;
var strikeindex;

var sHtmlContentCall = '';
var sHtmlContentPut = '';
var sHtmlSticky = '';
var HtmlHeaderCall;
var HtmlHeaderPut;
var typeHeaderCall;
var typeHeaderPut;



//var htmltable = "'<table>\n'";
//var htmltableoff = "'</table>\n'";
var htmlPUT99 = "<th class='type' onclick='f(99)'>PUT</th>\n";
var htmlclose = "</body>\n\</html>\n";

var htmlopen = "<!Doctype html>\n\
<html>\n\
<style>\n\
table {\
  font-family: MS Sans Serif;\n\
  font-size: 12px;\n\
  border-collapse: collapse;\n\
  width: 100%;\n\
  table-layout: fixed;\n\
  text-align: center;\n\
}\n\
div.sticky {\n\
  font-family: MS Sans Serif;\n\
  position: sticky;\n\
  top: 0;\n\
  background-color: yellow;\n\
  padding: 1px;\n\
  font-size: 12px;\n\
  border-collapse: collapse;\n\
  width: 100%;\n\
  table-layout: fixed;\n\
  text-align: center;\n\
}\n\
td, th {\n\
  border: 1px solid #ddd;\n\
  padding: 1px;\n\
}\n\
tr:nth-child(even){background-color: #f2f2f2;}\n\
tr:hover {background-color: #ddd;}\n\
th {\n\
  padding-top: 1px;\n\
  text-align: center;\n\
  background-color: white;\n\
  color: black;\n\
}\n\
</style>\n\
</head>\n\
<body onload='StartFunction()'>\n\
<script>\n\
var page = [];//save innerHTML pages in class'content'\n\
var lastpage = 0;\n\
function StartFunction()\n\
{\n\
	let count = document.getElementsByClassName('content').length;\n\
	for(let i = 0; i < count; i++)\n\
	{\n\
		page[i] = document.getElementsByClassName('content')[i].innerHTML;\n\
		if(i == 0){\n\
	        document.getElementsByClassName('header')[0].innerText = page[i].substring(14,84).replace('>', '');\n\
		}\n\
	}\n\
	for(let i = 1; i < count; i++)\n\
	{\n\
		document.getElementsByClassName('content')[i].innerHTML='';\n\
	}\n\
}\n\
function  f(x) {\n\
    let y = document.getElementsByClassName('type')[0];\n\
	if(x == 99)//select button call / put\n\
	{\n\
		if(y.innerText == 'PUT')\n\
			y.innerText = 'CALL';\n\
		else\n\
			y.innerText = 'PUT';\n\
			x = lastpage;\n\
	}\n\
	//get product\n\
	lastpage = x;\n\
	let z = 2 * x;\n\
	if(y.innerText == 'CALL')\n\
		z++;\n\
	document.getElementsByClassName('content')[0].innerHTML = page[z];\n\
	document.getElementsByClassName('header')[0].innerText = page[z].substring(14,84).replace('>', '');\n\
    document.getElementsByClassName('content')[1].innerHTML='';\n\
}\n\
</script>\n\
";



//program

var url = window.location.href;	//get url of current page
//alert(url);

if(url.includes("141164"))//if german page: set english page
{
    location = "https://www.eurex.com/ex-en/markets/idx/dax/DAX-Options-139884";
}

//check attached arguments in url: "...DAX-Options-139884?close"
var pos = url.search("close");
if(pos != -1)
{
    //on close wanted
    GM_setValue('mode', 'close');//set close request for other instances
    window.close();//close this instance
    return;//done for this
}
GM_setValue('mode', 'open');//normal: erase any close request

/*
if(url.includes("141164")) //cookiescript_reject
{
    setTimeout(function()//wait for button 'cookiescript_reject'
    {
        //click on button "decline all", if first call of eurex after cold start
        var x = document.getElementById('cookiescript_reject');
        //alert(x);
        if(x != null)//check for that message existing
        {
            //existing, click it
            var evt = document.createEvent("MouseEvents");
            evt.initEvent("click", true, true);
            document.getElementById('cookiescript_reject').dispatchEvent(evt);
        }
   }, 2 * 1000);
}
*/


mainselect(0);//click on button prices/quotes


var myInterval = setInterval(function(){

    switch (state){
        case 0:
        //make a list of all products
            //xxx
            if(0)//1:debug: load stored productDateString, convert to productDateList, 0:production, write new productDateString
            {
                productDateString = GM_getValue('productDateList');//read productDateString from persistent memory
                getproductlist();//convert productDateString to array productDateList
                state = 5;//jump over productDateString build
                break;
            }
            //assume monthly
            productDateString = '';
            //must wait for container
            x = document.getElementsByClassName("_filterContainer_15sg6_1 ")[1];
            if(x)
            {}
            else
                break;//repeat
            //got container
//            alert(111);
//            alert(row0.innerText + '   ' + row1.innerText);
            Products(1);
//            alert(row0.innerText + '   ' + row1.innerText);

            //if ok, state 1 is set, else remain in current state
            break;

        case 1:
            //save list of monthly products
//            productDateString += (row0.innerText + "\n" + row1.innerText + "\n");//has complete test!???
            productDateString += (row0.innerText + "\n");//has complete test!??? firefox
            //alert(productDateString);
            weekly();//switch to weekly
            state = 2;
            break;

        case 2:
            //must wait until weekly loaded
            //_filterButton_15sg6_42 _weekly_15sg6_72   //length > 1 is weekly
            //_filterButton_15sg6_42 _monthly_15sg6_63  //length > 1  is monthly else weekly
            x = document.getElementsByClassName("_filterButton_15sg6_42 _weekly_15sg6_72").length;
            if (x > 1)
                state = 3;//if ok, else remain in current state
            break;

        case 3:
            //get list of weekly products
            //alert(row0.innerText + '   ' + row1.innerText);
            Products(4);//parm is next state
            //save list
            productDateString += ('W\n' + row0.innerText + "\n" + row1.innerText + "E\n");//Weekly and End added
            break;

        case 4:
            //convert innerText to productDateList array
            getproductlist();
            if(listerror == 1)//on error start allover
            {
                listerror = 0;
                state = 0;
                break;
            }

            //init for walk through productDateList
            monthly();
            productDateIndex = 0;
//            productDateIndex = 13;
//            GM_setClipboard2(productDateList);
            productDate = productDateList[productDateIndex]
            state = 5;
            break;

        case 5:
            //wait for first monthly product
            expirationmode = 'monthly';
            contracttype = 'M';
            morelessbutton();
            text = document.getElementsByClassName('_filterButton_15sg6_42 _selected_15sg6_67 _monthly_15sg6_63');
            if(text[1].textContent == productDateList[0])
            {
                //ok, shows first monthly product
                //alert(text[1].textContent);
                state = 6;
            }
            break;

        case 6:
            //Run Through The Jungle
            morelessbutton();
            state = 20; //goto run strikecontent();//get strike content
            break

        case 61://return here from state 20+
            //alert(3333);
            //check for close window request in other window
            var exitmode = GM_getValue('mode');
           if(exitmode == 'close')
            {
                window.close();
                return;
            }
            //alert(4333);
            productDateIndex++;
            productDate = productDateList[productDateIndex];//is date or 'W' or 'E'
            state = 62;//need same delay here
            break;

        case 62:
            //alert(productDate);
            if(productDate == 'W')//weekly?
            {
                productDateIndex++;//skip 'W'
                offsetweekly = productDateIndex;//eurex weekly tables start with index 0, our productDateIndex needs adjustment
                //alert('W');
                productDate = productDateList[productDateIndex];
                contracttype = 'W';
                weekly();//switch to weekly
                state = 7;
                break;
            }
            if(productDate == 'E')//end of productDateList list?
            {
                //write everything to .html file
                SaveHtml();
                productDateIndex = 0;
                location = url;//reload page from eurex. will start all over with Monthly
                pause(3);
                break;
            }
////////////////////////
/*
            alert('index   ' + productDateIndex);
            //write everything to .html file
            if(productDateIndex == 2)
                SaveHtml();
*/
////////////////////////

            if(expirationmode === 'monthly')
            {
                text = document.getElementsByClassName('_filterButton_15sg6_42 _monthly_15sg6_63');
                text[productDateIndex + 1].click();
           }
            else//weekly
            {
                text = document.getElementsByClassName('_filterButton_15sg6_42 _weekly_15sg6_72');
                //text[productDateIndex + 1 - offsetweekly].click();//geht nicht
                //alte click methode:
                let evt = document.createEvent("MouseEvents");
                evt.initEvent("click", true, true);
                text[productDateIndex + 1 - offsetweekly].dispatchEvent(evt);
            }
           state = 6;
            break;

        case 7:
            //wait for first weekly product
            expirationmode = 'weekly';
            morelessbutton();
            text = document.getElementsByClassName('_filterButton_15sg6_42 _selected_15sg6_67 _weekly_15sg6_72');
            if(text[1].textContent == productDateList[productDateIndex])
            {
                //ok, shows first weekly product
                //alert(text[1].textContent);
                state = 6;
            }
            break;
//-----------------------------------------
//Get all data for one table, send it odax.exe

        case 20:
            //at product begin
            //init .odx content strings
            callline = "";
            putline = "";
            doneflag = 0;//set when all strike contents are read
            //init .html stuff
            sHtmlContentCall = '';
            sHtmlContentPut = '';

            //get lowest strike and save it   !!!
            var strikex = document.getElementsByClassName('_body_row_1xods_65 _row_desktop_1xods_33');
            strikeMin = strikex[0].textContent;

            //get highest strike and save it
            //scroll up
            highstrike();
            count = 0;//diagnostic !!!
            state = 21;//needs time to update screen
            break;

        case 21:
            //wait for lowest strike
            strikex = document.getElementsByClassName('_body_row_1xods_65 _row_desktop_1xods_33');
            var strike13 = strikex[1].textContent;
            if(strike13 == strikeMin)//if not yet ready !!!
            {
                //alert('wait');
                count++;
                break;
            }
            var strikeMax = strikex[13].textContent;
            //alert('max   ' + strikeMax + '  min   ' + strikeMin + '  count  ' + count);
            strikeindex = 13;//first strikeline to read
            state = 22;
            break;

//-----------------------------------------------------------------------------
        case 220://unused
            //get all strikeline pages with 15 strikes each
            strikecontent();
            if(doneflag == 0)
            {
                break;//repeat for next page
            }
            state = 23;//table done
//           if(productDateIndex > 19){alert(productDateIndex + '     ' + productDate + '   ' + header)}
            break;
//-----------------------------------------------------------------------------

       case 22:
            for(;;)
            {
                strikex = document.getElementsByClassName('_body_row_1xods_65 _row_desktop_1xods_33');
                strike = strikex[strikeindex].textContent;//get strike

                getstrikelineContent(strikeindex);//get content for one strike

                if(strike == strikeMin)//if it was last strike
                {
                    //alert('1: x' + strike  + '  strikeMin  ' + strikeMin);
                    doneflag = 1;
                    state = 23;//done, goto next state
                    break;
                }
                if(strikeindex != 0)//if not at end of strike page
                {
                    //alert('in page   ' + strike);
                    strikeindex--;
                    continue;//stay in same state
                }
                //strikeindex was 0, need new strike page
                strikeindex = 13;//first strikeline of page to read
                for(var i = 0; i < 14; )//shift table by number of lines shown
                {
                    i += arrowtop();
                }
                //continue;//stay in same state//geht nicht, zu schnell
                break;//stay in same state
            }
            //alert('new state');
            break;//to state


//-----------------------------------------------------------------------------





        case 23:
            //alert(1333);
            //make raw .odx file send to odax.exe

            if(flagHTML == 1)
            {
                makeSticky();
            }
            maketable();//make product
            //alert(productDateIndex + '     ' + productDate + '   ' + header);
            state = 29;
            break;

//-----------------------------------------
        case 29:
            //alert(2333);
            //on exit for next product
            lowstrike();//must rewind arrow buttons for next product
            state = 61;//goto next product
            break;

//-----------------------------------------
//helper for pause(n) command
        case 99:
            delay--;
            if(delay == 0)
                state = stateold;
            break;

//-----------------------------------------
    }//end of switch
}, 1 * 500);//end of Interval function, set sampling time. maybe down to 50 ms



//---------------------------------------------------------------------------------------
//low level helpers

/////////////////////////////////////
//may use for asyncronous delay
function pause(parm){
    delay = parm;
    stateold = state;
    state = 99;
}

/////////////////////////////////////
function mainselect(setparm)
{
    //press one of main select buttons
    //setparm 0:Preise/quotes,  1:Statistic

    // <li id="tabsTab-1.2" role="tab" aria-controls="tabsTabPanel-1.2" class="dbx-tabs__tab" data-js-tab="" aria-selected="false">
    var evt = document.createEvent("MouseEvents");
    evt.initEvent("click", true, true);
    if(setparm == 1)//statistic
    {
        document.getElementById('tabsTab-1.2').dispatchEvent(evt);
    }
    else if(setparm == 0)//preise/quotes
    {
        document.getElementById('tabsTab-1.1').dispatchEvent(evt);
    }
}

function Products(nextstate){
    //get all product dates. same for monthly and for weekly

    //hit MoreLessButton to dump all buttons
    let x = document.getElementsByClassName("_showMoreLessButton_15sg6_121 ")[0];
    if(x)//if button is shown
        if(x.innerText == 'Show more')//if button shows "more"
        {
            //click MoreLessButton to set big table product dates
            x.click();
            return;//repeat state, wait until "Show less"
        }
    //get content first row
    row0 = document.getElementsByClassName("_filterContainer_15sg6_1 ")[1];
    //get content second row
    row1 = document.getElementsByClassName("_row_15sg6_30 _otherRows_15sg6_38")[0];
    state = nextstate;
}

function morelessbutton()
{
    //hit MoreLessButton to dump all productdate buttons
    let x = document.getElementsByClassName("_showMoreLessButton_15sg6_121 ")[0];
    if(x)//if button is shown
        if(x.innerText == 'Show more')//if button shows "more"
        {
            //click MoreLessButton to set big table product dates
            x.click();
            return;//repeat state, wait until "Show less"
        }
}

function getproductlist(){
    //write productDateString data into productDateList array
    let myArray = productDateString.split("\n");
    listerror = 0;
    let i = 0;
    let j = 0;
    for(; i < 35;i++)
    {
        let s = myArray[i];//s holds product dates, W for weekly dates follow, E for end of list, junk "Show less"
        if((s.length == 10) | (s.length == 1))//note 'show less' is skipped!
        {
            productDateList[j] = s;
            if(productDateList[j] == 'E')
            {
                if((j == 22) | (j == 21) | (j == 20))//catch error; 4 or 5 weeklys expected
                    break;
                else
                {
                    monthly();
                    listerror = 1;//on error repeat all
                    alert(j);
                }
                break;
            }
            j++;
        }
    }
    GM_setValue('productDateList', productDateString);//write to persistent memory, will need it to shorten debug time
}

/////////////////////////////////////
function weekly()
{
    var evt = document.createEvent("MouseEvents");
    evt.initEvent("click", true, true);
    document.getElementsByClassName('_filterButton_15sg6_42 _weekly_15sg6_72')[0].dispatchEvent(evt);
    expirationmode = 'weekly';
}

function monthly()
{
    var evt = document.createEvent("MouseEvents");
    evt.initEvent("click", true, true);
    document.getElementsByClassName('_filterButton_15sg6_42 _monthly_15sg6_63')[0].dispatchEvent(evt);
    expirationmode = 'monthly';
}
/////////////////////////////////////
function highstrike()
{
    //get to highest strike;
    var i = 0;
    for(i = 0; i < 400;)
    {
        i += arrowbottom();
    }
}

function lowstrike()
{
    //get to lowest strike;
    var i = 0;
    for(i = 0; i < 400;)
    {
        i += arrowtop();
    }
}

 function getstrikelineContent(strikeindex)
{
    //alert(111);
    var i = strikeindex;
//    strike = strikex[i].textContent;//get strike//is already read
    //get additional info lines for call and put

    //call
    text = document.getElementsByClassName('react-table')[0]; //call
    var cellcount = text.rows[i + 1].cells.length;
    //alert(text.rows[i + 1].textContent);
    var line = "";
    for(var k = 0; k < cellcount; k++)
    {
        line += text.rows[i + 1].cells[k].textContent + " ";
        //alert(line);
    }
    callline += strike + " " + line + "\r\n";
    if(flagHTML)
        GetHtmlRowCall(strike + " " + line + "\r\n");


    //put
    text = document.getElementsByClassName('react-table')[1];//put
    line = "";
    for(k = 0; k < cellcount; k++)
    {
        line += text.rows[i + 1].cells[k].textContent + " ";
    }
    putline += strike + " " + line + "\r\n";
    if(flagHTML)
        GetHtmlRowPut(strike + " " + line + "\r\n");
}
/*
function strikecontent()//alte version, unused
{
    //read one page of 15 strikes.
    //repeated call is ok.
    //if all strikes are read, doneflag is set
    laststrike = strikeMin;
    var strikex = document.getElementsByClassName('_body_row_1xods_65 _row_desktop_1xods_33');//erroron13.08.24

    //alert(strikex[1].textContent)
    //alert("next13:" + strikex[13].textContent + "  last1:" + strikex[0].textContent + "  laststrike:" + laststrike);

    for(;;)//read one page of 15 strikes
    {
        for(var i = 13; i >= 0; i--)//i==0 is headline  i==14 gets 0
        {
            //alert(111);
            var x = strikex[i].textContent;//get strike
            //get additional info lines for call and put

            //call
            var text = document.getElementsByClassName('react-table')[0]; //call
            var cellcount = text.rows[i + 1].cells.length;
            //alert(text.rows[i + 1].textContent);
            var line = "";
            for(var k = 0; k < cellcount; k++)
            {
                line = line + text.rows[i + 1].cells[k].textContent + " ";
                //alert(line);
            }
            callline = callline + x + " " + line + "\r\n";
            //alert('call  ' + callline);

            //put
            text = document.getElementsByClassName('react-table')[1];//put
            line = "";
            for(k = 0; k < cellcount; k++)
                line = line + text.rows[i + 1].cells[k].textContent + " ";
            putline = putline + x + " " + line + "\r\n";
            //alert('put  ' + putline);

            if(x == strikeMin)//if at last strike
            {
//              alert('0: x' + x  + '  strikeMin  ' + strikeMin);
                doneflag = 1;//flags done for this page
                break;
            }
        }//end inner for-loop
        if(x == strikeMin)//if last strike
        {
//            alert('1: x' + x  + '  strikeMin  ' + strikeMin);
            doneflag = 1;
            break;
        }
        for(i = 0; i < 14; )//shift table by number of lines shown
        {
            i += arrowtop();
        }
        break;
    }//end outer for-loop
    //alert("bottom " + strikex[1].textContent + " laststrike: " + laststrike);
}
*/

function maketable()//add header, make raw .odx table and send it to odax.exe
{
    let d = new Date();
    handelszeit = d.toLocaleTimeString();
    handelstag = d.toLocaleDateString();
    productDate = productDateList[productDateIndex];
    productDate = productDate.replace('/20','.').replace(productDate[2],".");

    doneflag = 0;
    //table done, send it to host
    var total = document.getElementsByClassName('_total_cell_content_1xw9d_14');
//    alert(total[0].textContent);//Volume: 11,914OI adj: 195,526
    var tcall = total[0].textContent.replace(/,/g,"");
    var tput = total[1].textContent.replace(/,/g,"");
    //for html:
    let hCall = total[0].textContent.replace(/,/g,".").replace(/OI adj:/g," Open Interests:").replace(/Volume/,"Contracts");
    let hPut = total[1].textContent.replace(/,/g,".").replace(/OI adj:/g," Open Interests:").replace(/Volume/,"Contracts");
    HtmlHeaderCall = '<table type="CALL ProductDate: ' + productDate + '  ' + hCall + '                          ">\n';
    HtmlHeaderPut =  '<table type="PUT ProductDate: ' + productDate + '  ' + hPut + '                           ">\n';
    typeHeaderCall = 'CALL ProductDate: ' + productDate + '  ' + hCall + '                          ';
    typeHeaderPut  = 'PUT ProductDate: ' + productDate + '  ' + hPut + '                          ';

    var index = productDateIndex;//adjust weekly index
    //alert(index);
    if(contracttype == 'W')
        index--;

    header = "EUREX_ODAX_PAGE\r\n";
    //productDateIndex: laufende Seitennummer, index or productDateList
    header += handelstag + " " + handelszeit + " " + index + " " + contracttype + '\r\n';
    var callheader = header + productDate + "  " + tcall + '\r\n';
    var putheader = header + productDate + " " + tput + '\r\n';

    //alert('header ' + header + " " + strikeMin);
    var dataCall = callheader + "call\r\n" + callline;
    var dataPut = putheader + "put\r\n" + putline;
//    alert('putline' + putline);
//    alert('dataCall ' + dataCall);

    //        var data = maintable + "\r\n" + strike;
    var data = dataPut + dataCall;
    //alert('fine\n ' + data);
    if(flagHTML)
    {
        GetHTMLversion(data);//make final file.html
    }
    else
        GM_setClipboard1(data);//make DT-DL..., send to odax.exe
//alert('done');
}

/*
firefox: englisch
<p class="_content_1xw9d_22">
Volume: 1,194
</p>
<p class="_content_1xw9d_22">
OI adj: 14,318
</p>

chrome: deutsch
<p class="_content_1xw9d_22">
Gehandelte Kontrakte: 4.209
</p>
<p class="_content_1xw9d_22">
Open Interest: 181.691
</p>
*/


function arrowbottom()//click on button "arrow_bottom" svg-button
{
    var evt = document.createEvent("MouseEvents");
    evt.initEvent("click", true, true);
    //var xx = document.getElementsByClassName('_arrow_1r2tc_32 _arrow_bottom_1r2tc_42');
    var xx = document.getElementsByClassName ('_arrow_1htfc_32 _arrow_bottom_1htfc_42');//erroron13.08.24

    //alert(xx);
    if(xx)
    {
        //alert(xx[0]);
        xx[0].dispatchEvent(evt);
        return 1;
    }
    else
    {
        //alert('wait');
        return 0;
    }
}

function arrowtop()//click on button "arrow_top"  svg button
{
    var evt = document.createEvent("MouseEvents");
    evt.initEvent("click", true, true);
    //var xx = document.getElementsByClassName('_arrow_1r2tc_32 _arrow_top_1r2tc_35');
    var xx = document.getElementsByClassName('_arrow_1htfc_32 _arrow_top_1htfc_35');//error on13.08.24

    if(xx)
    {
        xx[0].dispatchEvent(evt);
        return 1;
    }
    else
    {
        //alert('wait');
        return 0;
    }
}
//-------------------------------------------------------------------------
//html zeug

function GetHtmlRowCall(line)
{
    //in: string line, enthält alle daten einer strikezeile
    //out:  ein tr block,
    //umsortieren hier für call und put getrennt

    sHtmlContentCall += ('<tr>\n');
    let s0 = line.split(" ");//s is array of strikeline contents
/*
    //debug let us see what is coming from eurex headline
    if(s0[0] == '24,000.00')// select a strike with complete info
    {
           alert(' 0# '+s0[0]+' 1# '+s0[1]+' 2# '+s0[2]+' 3# '+s0[3]+' 4# '+s0[4]+' 5# '+s0[5]+' 6# '+s0[6]+' 7# '+s0[7]+' 8# '+
          s0[8]+' 9# '+s0[9]+' 10# '+s0[10]+' 11# '+s0[11]+' 12# '+s0[12]+' 13# '+s0[13]);
    }
*/
    sHtmlContentCall += '  <td>' + s0[0] + '</td>\n';//strike
    sHtmlContentCall += '  <td>' + s0[7] + '</td>\n';//price
    sHtmlContentCall += '  <td>' + s0[9] + '</td>\n';//volume
    sHtmlContentCall += '  <td>' + s0[11] + '</td>\n';//bid
    sHtmlContentCall += '  <td>' + s0[12] + '</td>\n';//ask
    sHtmlContentCall += '  <td>' + s0[2] + '</td>\n';//time
    sHtmlContentCall += '  <td>' + s0[3] + '</td>\n';//date
    sHtmlContentCall += '  <td>' + s0[4] + '</td>\n';//open
    sHtmlContentCall += '  <td>' + s0[5] + '</td>\n';//high
    sHtmlContentCall += '  <td>' + s0[6] + '</td>\n';//low
    sHtmlContentCall += '  <td>' + s0[10] + '</td>\n';//settle
    sHtmlContentCall += '  <td>' + s0[8] + '</td>\n';//OpenInt
    sHtmlContentCall += ('</tr>\n');
}

function GetHtmlRowPut(line)
{
    //alert(line);
    //in: string line, enthält daten einer strikezeile
    //out:  ein tr block,
    sHtmlContentPut += ('<tr>\n');
    let s0 = line.split(" ");//s is array of strikeline contents
/*
    if(s0[0] == '24,000.00')
    {
           alert(' 0# '+s0[0]+' 1# '+s0[1]+' 2# '+s0[2]+' 3# '+s0[3]+' 4# '+s0[4]+' 5# '+s0[5]+' 6# '+s0[6]+' 7# '+s0[7]+' 8# '+
          s0[8]+' 9# '+s0[9]+' 10# '+s0[10]+' 11# '+s0[11]+' 12# '+s0[12]+' 13# '+s0[13]);
    }
*/
    sHtmlContentPut += '  <td>' + s0[0] + '</td>\n';//strike
    sHtmlContentPut += '  <td>' + s0[4] + '</td>\n';//price
    sHtmlContentPut += '  <td>' + s0[5] + '</td>\n';//volume
    sHtmlContentPut += '  <td>' + s0[2] + '</td>\n';//bid
    sHtmlContentPut += '  <td>' + s0[3] + '</td>\n';//ask
    sHtmlContentPut += '  <td>' + s0[11] + '</td>\n';//time
    sHtmlContentPut += '  <td>' + s0[12] + '</td>\n';//date
    sHtmlContentPut += '  <td>' + s0[8] + '</td>\n';//open
    sHtmlContentPut += '  <td>' + s0[9] + '</td>\n';//high
    sHtmlContentPut += '  <td>' + s0[10] + '</td>\n';//low
    sHtmlContentPut += '  <td>' + s0[7] + '</td>\n';//settle
    sHtmlContentPut += '  <td>' + s0[6] + '</td>\n';//OpenInt
    sHtmlContentPut += ('</tr>\n');
}

function makeSticky()
{
    //the lines witch are sticked at top
    //open the first row with PUT / CALL button
    sHtmlSticky = "<div class='sticky'>\n\
    <div class='products'>\n\
    <table>\n  <td class='type' onclick='f(99)'>PUT</td>\n\
    ";
    //product dates
    let count = productDateList.length;
    let sStickydate = '';//init
    let i = 0;
    let date = '';
    for(; i < 11; i++)
    {
        date = productDateList[i];//replace 18/12/2025 -> 18.12.25
        date = date.replace('/20','.').replace(date[2],".");
        sHtmlSticky = sHtmlSticky.concat('  <th class="type" onclick="f(' + i + ')">' + date + '</th>\n');
    }
  sHtmlSticky += ('</table><table>\n');//close first row of product dates, open second
  sHtmlSticky += '<th></th>\n'//leave field under PUT empty
    let j = i;//i index of productDateList(including 'W'), j = index of dates in class="type"
    for(; ; i++)
    {
        if(productDateList[i] == 'W')
        {
            sHtmlSticky += '<th>weekly</th>\n'
            continue;
        }
        if(productDateList[i] == 'E')
        {
            break;
        }
        date = productDateList[i];//change from '08/12/2025' to '08.12.25'
        date = date.replace('/20','.').replace(date[2],".");
        sHtmlSticky += '<th class="type" onclick="f(' + j + ')">' + date + '</th>\n ';
        j++;
    }
    //2 * empty fields after weekly
    sHtmlSticky += '<th></th>\n'
    sHtmlSticky += '<th></th>\n'
    sHtmlSticky += ('</table><table>\n');//close table, open new one for headline

    //strike headline shows column names:
    //strike	price	volume	bid	   ask     time	date	open	high	low	settle	OpenInt.

    //add table headline class="header"
    sHtmlSticky += ('<th></th>\n<th></th>\n</table>\n');
     sHtmlSticky += ('<div class="header">\n<table>\n<td>ODAX</td>\n</table>\n</div>\n</div>\n');
    sHtmlSticky += ('<table>\n\
     <td>strike</td>\n\
     <td>price</td>\n\
     <td>volume</td>\n\
     <td>bid</td>\n\
     <td>ask</td>\n\
     <td>time</td>\n\
     <td>date</td>\n\
     <td>open</td>\n\
     <td>high</td>\n\
     <td>low</td>\n\
     <td>settle</td>\n\
     <td>OpenInt.</td>\n\
     </table>\n</div>\n');
}//end of div sticky


function GetHTMLversion(data)
{
      var sHtmlContentCallOpen = '<div class="content">\n' + HtmlHeaderCall;
      var sHtmlContentPutOpen = '<div class="content">\n' + HtmlHeaderPut;

    var productStrikeData = sHtmlContentPutOpen + sHtmlContentPut
        + '</table>\n'
        + sHtmlContentCallOpen + sHtmlContentCall
        + '</table>\n';

    if(0)//1: debug, get one product only//xxx
    {
        //single product put and call
        data = htmlopen + sHtmlSticky + productStrikeData + htmlclose;//htmlclose="</body>\n\</html>\n";
        GM_setClipboard2(data);//one product only, put and call
        return;
    }

    //many products
    //save content data to persistent memory
    if(productDateIndex == 0)
    {
        //if we are at first product
        //save header and strike data
        GM_setValue("productdata", htmlopen + sHtmlSticky + productStrikeData);
    }
    else
    {
        //add strike data only
        var oldstrikes = GM_getValue("productdata");
        GM_setValue("productdata", oldstrikes + productStrikeData);
    }
}

function SaveHtml()
{
    //make final .html file
    var productdata = GM_getValue("productdata");
    GM_setClipboard2(productdata + htmlclose);
    alert(1111);//chance to stop, replace by shut window or rpeat in 60 minutes
}

function GM_setClipboard2(data)	//send to browser download directory
{
    var filename = "Alist.html";
    var a = document.createElement('a');
    a.style = "display: none";
    var blob = new Blob([data]);
    var url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 200);
}

function GM_setClipboard1(data)	//send to browser download directory
{
    var filename = "DT-DL1odaxtoday.txt";
    var a = document.createElement('a');
    a.style = "display: none";
    var blob = new Blob([data]);
    var url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 200);
}

//-----------------------------------------------------------------------

