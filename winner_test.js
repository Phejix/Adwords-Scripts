//Variable Intialisation

//Set the minimum number of ads an ad group has to be considered for analysis
var ad_minimum = 6;

//Set the Date Range can be one of the following:
//'TODAY, YESTERDAY, LAST_7_DAYS, THIS_WEEK_SUN_TODAY, LAST_WEEK, LAST_14_DAYS, LAST_30_DAYS, LAST_BUSINESS_WEEK, LAST_WEEK_SUN_SAT, THIS_MONTH, LAST_MONTH, ALL_TIME'
var date_range = 'LAST_30_DAYS';

//Set the minimum number of required winners for labels to be applied (else labelled unclear)
var winners_threshold = 3;

//Set the label for winning ads
var winners_label = 'winner';

//Set the label for losing ads
var losers_label = 'loser';

//Set the label for unclear ads (defined by the winners_threshold)
var unclear_label = 'no winner';

//Set the spreadsheet url to print the report to
var spreadsheet_url = "https://docs.google.com/spreadsheet_url";

//Set whether to build a report or not
var create_report = false;

//Sets an object to easily call labels within other methods
var reference_object = {
    winners : winners_label,
    losers : losers_label,
    unclear : unclear_label
};

function main(){
    Logger.log("Script Running");

    Logger.log("Checking Labels");

    create_labels(winners_label, losers_label, unclear_label);

    ads_object = get_winners_and_losers(
        ad_minimum,
        date_range,
        winners_threshold
    );

    apply_labels(
        ads_object,
        winners_label,
        losers_label,
        unclear_label
    );

    if (create_report){
        Logger.log("Building Spreadsheet at " + spreadsheet_url);
        build_report(spreadsheet_url, ads_object, date_range);
    }

    Logger.log("Script Complete");
}

//Applies the check to see which ads will be labelled as winners and which as losers
//Takes into account the minimum required number of ads and labels to be ignored
function get_winners_and_losers(ad_minimum, date_range, winners_threshold){
    var winning_ads = [];
    var losing_ads = [];
    var unclear_ads = [];

    //Calls a adGroups selector which takes adgroups within
    //the given date range and which are 'enabled'
    //.get() returns the iterator of those selected
    var adGroupIterator = AdWordsApp.adGroups()
        .withCondition('Status = ENABLED')
        .forDateRange(date_range)
        .withLimit(10)
        .get();

    Logger.log("Filtering Ad Groups");

    while (adGroupIterator.hasNext()){
        var adGroup = adGroupIterator.next();

        Logger.log("Checking AdGroup: " + adGroup.getName());

        var group_winners = [];
        var group_losers = [];

        /*Ads selector, similar to the ad groups one
        ordered by Impressions descending first then by
        CTR*/
        var adGroupAds = adGroup.ads()
            .withCondition("Status = ENABLED")
            .forDateRange(date_range)
            .orderBy("Impressions DESC")
            .orderBy("Ctr DESC")
            .get();

        Logger.log(adGroupAds.totalNumEntities() + " ads found.");

        //First Threshold - AdGroup from the selector must have greater than ad_minimum number of ads in
        if (adGroupAds.totalNumEntities() >= ad_minimum){
            /*Winning ads must be in the top 50% of ads with regards to impressions,
            as impressions are ordered descending in the iterator (from the selector above) we can take the
            first half of the iterator as winners. Unfortunately the iterator isn't a list
            so can't be sliced*/
            var impressions_threshold = Math.ceil(0.5 * adGroupAds.totalNumEntities());
            var iteration = 0;

            while (adGroupAds.hasNext()){
                var ad = adGroupAds.next();

                //Winners must be the top 3 in CTR, as the ads are ordered second by CTR this
                //should mean that the first 3 ads in the iterator are the top 3 in CTR
                if (iteration <= impressions_threshold && group_winners.length < 3){
                    group_winners.push(ad);
                }
                else{
                    group_losers.push(ad);
                }

                iteration++;
            }
        }
        //Any Ad Groups that don't have the required amount of ads in are to be ignored completely
        else{continue;}

        Logger.log("Winning Ads: " + group_winners.length + "     Losing Ads: " + group_losers.length);

        //There must be a certain amount of winners (determined by winners_threshold) else
        //the ads in the group are labelled under the unclear label 
        if (group_winners.length >= winners_threshold){
            winning_ads = winning_ads.concat(group_winners);
            losing_ads = losing_ads.concat(group_losers);
        }
        else{
            unclear_ads = unclear_ads.concat(group_winners, group_losers);
        }
    }

    return {winners : winning_ads, losers : losing_ads, unclear : unclear_ads};
}

//Loops through an object containing a winners, losers and unclear list and 
//applies the given labels to the ads
function apply_labels(separated_ads_object, winners_label, losers_label, unclear_label){
    for (key in separated_ads_object){
        Logger.log("Applying " + separated_ads_object[key].length + " labels to " + key);
        for (ad in separated_ads_object[key]){
            separated_ads_object[key][ad].applyLabel(reference_object[key]);
        }
    }
}


//Creates the labels in the account (labels must exist at the account level before they can be applied t0 ads/campaigns)
function create_labels(winners_label, losers_label, unclear_label){
    var labelIterator = AdWordsApp.labels().get();
    var label_check = {winner : false, loser : false, unclear_label : false};

    while (labelIterator.hasNext()){
        var label = labelIterator.next();

        if (label.getName() === winners_label){
            label_check["winner"] = true;
        }

        if (label.getName() === losers_label){
            label_check["loser"] = true;
        }

        if (label.getName() === unclear_label){
            label_check["unclear_label"] = true;
        }
    }

    if (label_check["winner"] === false){
        AdWordsApp.createLabel(
            winners_label,
            "Used for tagging winning ads according to the winners/losers script",
            "#079938");
    }

    if (label_check["loser"] === false){
        AdWordsApp.createLabel(
            losers_label,
            "Used for tagging losing ads according to the winners/losers script",
            "#dd1d04");
    }

    if (label_check["unclear_label"] === false){
        AdWordsApp.createLabel(
            unclear_label,
            "Used for tagging ads in ad groups with no clear winners according to the winners/losers script",
            "#e3effc"
            );
    }
}

function build_report(spreadsheet_url, report_object, date_range){
    var spreadsheet = SpreadsheetApp.openByUrl(spreadsheet_url);
    var report_sheet = spreadsheet.insertSheet("Winners and Losers Label Report");

    //Append header row
    report_sheet = report_sheet.appendRow([
        "Campaign",
        "Ad Group",
        "Id",
        "Headline",
        "Description 1",
        "Description 2",
        "CTR",
        "Impressions",
        "Clicks",
        "Change Made"]);

    //Appends the data
    for (key in report_object){
        for (var i = 0; i < report_object[key].length; i++){
            report_sheet = report_sheet.appendRow(key, report_object[key][i], date_range);
        }
    }
}

function create_row(key, ad, date_range){
    var stats = ad.getStatsFor(date_range);
    var change = "Label Added - " + reference_object[key];

    //Row Order: Campaign Name, Ad Group, Ad ID,
    //Ad Headline, Ad Description 1, Ad Description 2
    //Ctr, Impressions, Clicks, Description of Change Made
    var row = [
        ad.getCampaign().getName(),
        ad.getAdGroup().getName(),
        ad.getId(),
        ad.getHeadline(),
        ad.getDescription1(),
        ad.getDescription2(),
        stats.getCtr(),
        stats.getImpressions(),
        stats.getClicks(),
        change
        ];

    return row
}