const UserModel = require("../../Models/User/User.model");
const { ObjectId } = require("mongodb");
const ShareModel = require("../../Models/User/Share.model");
const PlayModel = require("../../Models/Play.model");
const BetModel = require("../../Models/BetsList/OddsBetsList.model");
const OpenBestModel = require("../../Models/BetsList/OpenBetsList.model");
const FancyBetModel = require("../../Models/BetsList/FancyBetsList.model");
const CasinoBetModel = require("../../Models/BetsList/CasinoBetsList.model");
const OddsPositionModel = require("../../Models/BetsList/OddsPosition.model");
const sportsListModel = require("../../Models/sportList.model");
const sportsMarketListModel = require("../../Models/sportsMarketList.model");
const TransactionLogModel = require("../../Models/TransactionLog.model");
const directUserShareModel = require("../../Models/User/directUserShareModel");
const {
  fetchUrl,
  siteSetting,
  UserTypes,
  mimMaxCoinsData,
  betfairMaximumAllowOddsBySportWise,
  ByDefaultBetfairMarketBlockArray
} = require("../../Common/Constants");
const { returnResponse } = require("../../Helpers/ResponseMapper");
const axios = require("axios");
axios.defaults.timeout = siteSetting.axiosTimeOut;
const {
  client,
  getBookmakerFancyByRedis,
  getBetfairMarketDataByRedis,
  getRacingDataByRedis,
} = require("../../Helpers/RedisHelper");


const { getUserCoinsByTransactionTable } = require("../../Helpers/TransactionHelper")

const {
  _dx,
  _d,
  convertKeyObject,
  convertObjectToArray,
  removeDuplicates,
  getClientShareArray,
  sleep,
  _date_time,
  throughSocketDataByAxios,
  extractSubdomainAndDomainByHost,
  getSettingData,
  getTimeDifference
} = require("../../Helpers/CommonHelper");
const { json } = require("body-parser");
const { TRUE } = require("../../utils/constants");


const calculateCombinedOdds = (type = 'back') => {
  try {
    if (matchOddsSelected.length < 2) return null;
    const matchOddsData = finalSocket['Match Odds'];
    if (!matchOddsData || !matchOddsData.runners) return null;
    let totalProbability = 0;
    const selectedRunners = matchOddsData.runners.filter((_, index) => matchOddsSelected.includes(index + 1));
    selectedRunners.forEach((runner) => {
      const odds = type === 'back' ? runner.ex?.availableToBack?.[0]?.price : runner.ex?.availableToLay?.[0]?.price;
      if (odds && !isNaN(odds)) {
        totalProbability += 1 / odds;
      }
    });
    if (totalProbability === 0) return null;
    const combinedOdds = (1 / totalProbability) - 1;
    return Math.round(combinedOdds * 100) / 100;
  } catch (error) {
    console.error('Error calculating combined odds:', error);
    return null;
  }
};


const saveOpenBets = async (bodyData, matchData) => {
  let loginDetails = bodyData.loginDetails
  let clientId = loginDetails.userId
  let marketId = bodyData.marketId
  let selectionId = bodyData.selecctionId
  let betType = bodyData.type
  delete bodyData.loginDetails


  let openBets = {
    marketId: matchData.marketId,
    userId: loginDetails.userId,
    clientId: loginDetails.userId,
    eventId: matchData.eventId,
    betfairMarketId: bodyData.betfairMarketId ? bodyData.betfairMarketId : matchData.marketId,
    matchName: matchData.matchName,
    amount: bodyData.amount,
    selectionId: bodyData.selectionId,
    oddsType: bodyData.betFor,
    type: bodyData.type,
    odds: bodyData.odds,
  }

  const marketData = await sportsMarketListModel.findOne({
    marketId: bodyData.betfairMarketId,
  });

  if (!marketData) {
    return returnResponse(
      "error",
      "marketData not found in database"
    );
  }

  let teamData = []
  let teamName = ""
  const selectionIdData = marketData.selectionIdData;
  selectionIdData.map((selection) => {
    let push = {
      selection_id: selection.selectionId,
      runner_name: selection.runnerName,
    };
    teamData.push(push);

    if (bodyData.selectionId == selection.selectionId) {
      teamName = selection.runnerName
    }
  });

  openBets.teamName = teamName

  let openBetsPosition = await OpenBetsMatchPosition([openBets], teamData);
  let oldPopenBetsPositionarrss = Object.values(openBetsPosition);
  let openBetsPositionAmountMin = Math.min(...oldPopenBetsPositionarrss);

  let placedMatchBets = await OpenBestModel.find({ marketId: marketId, userId: clientId })

  if (!placedMatchBets) {
    placedMatchBets = []
  } else {
    placedMatchBets = JSON.parse(JSON.stringify(placedMatchBets));
  }


  let oldBetPosition = await OpenBetsMatchPosition(placedMatchBets, teamData);
  let oldPosMinAmountarr = Object.values(oldBetPosition);
  let oldPosMinAmount = Math.min(...oldPosMinAmountarr);


  let placedBetsWithOpenBets = [...placedMatchBets, openBets];
  let newBetsPosition = await OpenBetsMatchPosition(placedBetsWithOpenBets, teamData);
  let newBetsPositionArr = Object.values(newBetsPosition);
  let newPosMinAmount = Math.min(...newBetsPositionArr);

  let userCoins = 0
  let realUserCoins = await getUserCoinsByTransactionTable(clientId)
  if (realUserCoins && realUserCoins.totalCoins) {
    userCoins = realUserCoins.totalCoins
  }
  let deductAmount = oldPosMinAmount
  if (newPosMinAmount < oldPosMinAmount) {
    deductAmount = newPosMinAmount
  }

  if (Math.abs(deductAmount) > userCoins) {
    return returnResponse(
      "error",
      "invalid Amount"
    );
  }

  let openBetId = await OpenBestModel.create(openBets)
  await TransactionLogModel.deleteMany({
    marketId: marketId,
    overallType: "openBet",
    forBet: 1,
    userId: clientId,
  })

  let transactionInsert = {
    amount: deductAmount,
    userId: clientId,
    marketId: marketId,
    overallType: "openBet",
    forBet: 1,
    betId: openBetId._id
  }

  await TransactionLogModel.create(transactionInsert)
  await client.del(`${clientId}_openBets_${marketId}`)

  return returnResponse(
    "success",
    "openBet Success"
  );
}


const getNewOpenBetsPosition = async (userId, marketId) => {
  let openBets = await OpenBestModel.find({ marketId: marketId, userId: userId })
  if (!openBets) {
    openBets = []
  } else {
    openBets = JSON.parse(JSON.stringify(openBets));
  }
  const marketData = await sportsMarketListModel.findOne({
    marketId: marketId,
  });
  
  if (!marketData) {
    return returnResponse(
      "error",
      "marketData not found in database"
    );
  }
  let teamData = []
  const selectionIdData = marketData.selectionIdData;
  selectionIdData.map((selection) => {
    let push = {
      selection_id: selection.selectionId,
      runner_name: selection.runnerName,
    };
    teamData.push(push);
  });
  let openBetsPosition = await OpenBetsMatchPosition(openBets, teamData);
  let newBetsPositionArr = Object.values(openBetsPosition);
  let newPosMinAmount = Math.min(...newBetsPositionArr);
  return returnResponse(
    "success",
    "openBet Success",
    newPosMinAmount
  );
}

const deconstructMarketData = async (data, reqData, settingData) => {
  let finalOdds = [];
  let finalReturnData = {};
  let status = false;
  let sendMsg = ""

  data.forEach((element) => {
    if (element.selectionId == reqData.selectionId) {
      let odds = element.ex;
      let compareData = [];
      let lgaai = 0;
      let khaai = 0;
      if (reqData.type == "K" || reqData.type == "k") {
        compareData = odds.availableToLay;
        finalOdds = compareData[0];
        khaai = (finalOdds.price - 1).toFixed(2);
      }

      if (reqData.type == "l" || reqData.type == "L") {
        compareData = odds.availableToBack;
        finalOdds = compareData[0];
        lgaai = (finalOdds.price - 1).toFixed(2);
      }

      finalReturnData.lgaai = lgaai;
      finalReturnData.khaai = khaai;

      finalReturnData.team_name = element.selectionName;
      finalReturnData.selectionid = element.selectionId;


      if (reqData.type == "K" && finalOdds.price < reqData.odds) {
        reqData.odds = finalOdds.price
      }
      if (reqData.type == "L" && finalOdds.price > reqData.odds) {
        reqData.odds = finalOdds.price
      }

      let maxBetfairOddsCheck = settingData.maxBetfairOddsCheck ? Number(settingData.maxBetfairOddsCheck) : 15


      if (
        reqData.odds == finalOdds.price &&
        finalOdds.price != 0 &&
        finalOdds.price > 0 &&
        reqData.odds > 0 &&
        reqData.odds != 0 &&
        reqData.odds < maxBetfairOddsCheck &&
        finalOdds.price < maxBetfairOddsCheck
      ) {
        status = true;
      }

      if (finalOdds.price > maxBetfairOddsCheck || reqData.odds > maxBetfairOddsCheck) {
        sendMsg = `we can accept maximum odds ${maxBetfairOddsCheck}`
      }

    }
  });

  return returnResponse(status, sendMsg, finalReturnData);
};

const checkLiveMatchOdds = async (reqData, oddsRange = 0 , isCombinedNew = false) => {
  t0 = Date.now();
  let marketId = reqData.marketId;
  let eventId = reqData.eventId;
  let betFor = reqData.betFor;
  let selectionId = reqData.selectionId;
  let odds = parseFloat(reqData.odds);
  let type = reqData.type;
  let fancyType = "Normal"
  let gtype = "fancy"
  let isCombined = reqData.isCombined ? true : false

  if (reqData && reqData.fancyType && reqData.fancyType != "") {
    fancyType = reqData.fancyType
  }

  if (reqData && reqData.gtype && reqData.gtype != "") {
    gtype = reqData.gtype
  }
  let oddsUrl = `${siteSetting.checkMatchDataUrl}${marketId}`;

  let [matchData, settingData] = await Promise.all([
    sportByMarketId(marketId),
    getSettingData(),
  ]);

  if (!matchData) {
    return returnResponse(
      "error",
      "Something Went Wrong ! We are not getting match data"
    );
  }

  let marketListObj = {}
  let betfairMarketListAll = matchData.marketList ? matchData.marketList : []
  if (betfairMarketListAll && betfairMarketListAll.length > 0) {
    betfairMarketListAll.map((mar) => {
      marketListObj[mar.marketId] = mar
    })
  }



  if (matchData.cacheUrl) {
    oddsUrl = matchData.cacheUrl;
  }

  const betPerm = matchData.betPerm;

  if (!betPerm) {
    return returnResponse(
      "error",
      "Something Went Wrong ! Bet is Block Please Try After Sometime"
    );
  }


  let isLineMarket = false
  if (reqData && reqData.isLineMarket) {
    isLineMarket = true
  }

  let betfairMarketList = betfairMarketListAll.map(item => item.marketType)
  let manualMarketArray = [
    "matchOdds",
    "tiedMatch",
    "completeOdds",
  ]

  betfairMarketList = [...manualMarketArray, ...betfairMarketList];
  const oddsTypesUsingMarketCache = new Set(betfairMarketList);

  if (!oddsUrl && matchData?.cacheUrl) {
    oddsUrl = matchData.cacheUrl;
  }

  let isBetfairFlag = false
  if (reqData.betfairMarketId && oddsTypesUsingMarketCache.has(reqData.oddsType)) {
    oddsUrl = `${settingData.betfairCacheUrlByMarketId ?? ""}${reqData.betfairMarketId}`;
    if (settingData.betfairSocketUrl && settingData.betfairSocketUrl != "") {
      oddsUrl = `${settingData.betfairSocketUrl}v2/api/fetchMarketOdds?marketId=${reqData.betfairMarketId}`;
    }
    isBetfairFlag = true
  }

   let finalMarketData  = {}
   if (isBetfairFlag && marketListObj[reqData.betfairMarketId]) {
    finalMarketData = marketListObj[reqData.betfairMarketId]
   }
  
  

  let fetchFromRedis = false
  if (settingData.isBookmakerRedis && (betFor === "odds" || betFor == "toss" || betFor === "fancy")) {
    fetchFromRedis = true
  }

  if (settingData.isBetFairRedis && (betFor === "matchOdds" || betFor == "tiedMatch" || betFor == "Over/Under 1.5 Goals" || betFor == "Over/Under 2.5 Goals" | betFor == "To Win the Toss")) {
    fetchFromRedis = true
  }





  const defaultBetDelay = Number(matchData.betDelayTime) || 0;
  const betDelaySetting = matchData.betDelaySetting ?? {};
  const betDelayKeyByBetFor = {
    fancy: "fancyBetDelay",
    toss: "tossBetDelay",
    matchOdds: "matchOddsBetDelay",
    tiedMatch: "tieBetDelay",
    odds: "bookMakerBetDelay",
    line:"lineMarketfancyBetDelay"
  };
  const chosenKey = isLineMarket ? betDelayKeyByBetFor["line"] : betDelayKeyByBetFor[reqData.betFor];
  let betDelayTime = Number(defaultBetDelay);
  if (chosenKey && isFinite(Number(betDelaySetting[chosenKey]))) {
    const override = Number(betDelaySetting[chosenKey]);
    if (!Number.isNaN(override) && override >= 0) betDelayTime = override;
  }

  if (isBetfairFlag && finalMarketData && finalMarketData.betDelay && finalMarketData.betDelay != 0) {
    betDelayTime = finalMarketData.betDelay
  }

  if (betDelayTime && betDelayTime != 0) {
    await sleep(betDelayTime * 1000);
  }
  

const playStatusKey = Object.hasOwn(finalMarketData, "playStatus");

if (isBetfairFlag && finalMarketData && !finalMarketData.playStatus  && playStatusKey)   {
    return returnResponse(
      "error",
      "bet is off on this particualr betfair Market"
    );
 }
  

  getTimeDifference?.(t0, "axios start");
  let oddsData = {}

  if (!fetchFromRedis) {
    const axiosPromise = axios
      .get(oddsUrl, { timeout: 3000 })
      .then((res) => res?.data)
      .catch((err) => {
        console.error("Odds fetch failed:", err?.message || err);
        return returnResponse("error", "Odds Not Coming due to api Please Try After Sometime");
      })
      .finally(() => getTimeDifference?.(t0, "axios end"));
    [oddsData] = await Promise.all([axiosPromise]);
    if (!oddsData) {
      return returnResponse("error", "Odds Not Coming Please Try After Sometime");
    }
  } else {
    if (betFor === "odds" || betFor == "toss" || betFor === "fancy") {
      oddsData = await getBookmakerFancyByRedis(marketId)
      if (oddsData) {
        oddsData = { result: oddsData }
      }
    } else if (betFor === "matchOdds" || betFor == "tiedMatch" || betFor == "Over/Under 1.5 Goals" || betFor == "Over/Under 2.5 Goals" | betFor == "To Win the Toss") {
      oddsData = await getBetfairMarketDataByRedis(marketId)
      if (oddsData) {
        oddsData = {
          message: 'data fetched',
          code: 0,
          error: false,
          data: [oddsData]
        }
      } else {
        oddsData = {
          error: true,
        }
      }
    }
  }

  if (isCombinedNew) {
    return {
      oddsData: oddsData.data ? oddsData.data : oddsData,
      matchData: matchData,
      settingData:settingData
    }
  }

  // _d(JSON.parse(matchData.maxMinCoins) , "matchData.maxMinCoins")

  let coinsSetting = {};
  let maxMinCoins = matchData?.maxMinCoins
  
try {
    if (maxMinCoins && typeof maxMinCoins === "string") {
        const fixed = maxMinCoins.replace(/([{,])(\w+):/g, '$1"$2":');
        coinsSetting = JSON.parse(fixed);
    } else if (maxMinCoins && typeof maxMinCoins === "object") {
        coinsSetting = maxMinCoins;
    }
} catch (err) {
    console.log("Invalid maxMinCoins JSON:", err);
}
  
  
  let sessionMaxAmount = coinsSetting.maximum_session_bet ?? 100000;
  let sessionMinAmount = coinsSetting.minimum_session_bet ?? 100;
  let oddsMaxAmount = coinsSetting.maximum_match_bet ?? 200000;
  let oddsMinAmount = coinsSetting.minimum_match_bet ?? 100;

  const oddsOverrideKey = {
    matchOdds: "maximum_matchOdds_coins",
    tiedMatch: "maximum_tie_coins",
    toss: "maximum_toss_coins",
  }[reqData.betFor];

  if (oddsOverrideKey && Number.isFinite(Number(coinsSetting[oddsOverrideKey]))) {
    oddsMaxAmount = Number(coinsSetting[oddsOverrideKey]);
  }

  if (matchData.sportId == 1 ) {
     oddsMaxAmount = settingData && settingData.maxFootballOddsAmt ? settingData.maxFootballOddsAmt : oddsMaxAmount
  }

  if (matchData.sportId == 3 ) {
     oddsMaxAmount = settingData && settingData.maxTennisOddsAmt ? settingData.maxTennisOddsAmt : oddsMaxAmount
  }

  if (matchData.sportId == 7 ) {
     oddsMaxAmount = settingData && settingData.maxHorseRacingOddsAmt ? settingData.maxHorseRacingOddsAmt : oddsMaxAmount
  }

  if (matchData.sportId == 4339 ) {
     oddsMaxAmount = settingData && settingData.maxGreyHoundOddsAmt ? settingData.maxGreyHoundOddsAmt : oddsMaxAmount
  }
      
  if (isBetfairFlag && finalMarketData && finalMarketData.maxBet && finalMarketData.maxBet != 0) {
    oddsMaxAmount = finalMarketData.maxBet
  }


  const betAmount = reqData.amount;

  let checkOddsData = {};
  let status = "success";
  let message = "";
  let finalOddsData = [];
  let sendOddsData = [];

  let isMatchOdds = false;
  let isFancy = false;
  let isCompletedOdds = false;
  let isTieOdds = false;
  let isToss = false;
  let isBookmaker = false;

  let betfairMarketId = marketId

  if (matchData.isBookmaker) {
    isBookmaker = matchData.isBookmaker;
  }

  if (matchData.isFancy) {
    isFancy = matchData.isFancy;
  }

  if (matchData.isMatchOdds) {
    isMatchOdds = matchData.isMatchOdds;
  }

  if (matchData.isCompletedOdds) {
    isCompletedOdds = matchData.isCompletedOdds;
  }


  if (matchData.isTieOdds) {
    isTieOdds = matchData.isTieOdds;
  }

  if (matchData.isToss) {
    isToss = matchData.isToss;
  }


  if (betFor == "toss" && !isToss) {
    return returnResponse(
      "error",
      "toss bet inactive right now Please contact your upperline"
    );
  }

  if (betFor == "matchOdds" && !isMatchOdds) {
    return returnResponse(
      "error",
      "match Odds bet inactive right now Please contact your upperline"
    );
  }

  if (betFor == "tiedMatch" && !isTieOdds) {
    return returnResponse(
      "error",
      "tieOdds bet inactive right now Please contact your upperline"
    );
  }


  if (betFor === "odds" || betFor == "toss") {
    oddsData = oddsData.result;
    const oddsType = reqData.oddsType;



    if (oddsType == "bookmaker") {
      if (type != "K" && type != "k" && type != "L") {
        return returnResponse("error", "odds Expire due to wrong type");
      }

      checkOddsData = oddsData.team_data;

      sendOddsData = convertKeyObject(checkOddsData, "selectionid");

      finalOddsData = sendOddsData[selectionId + ""];

      const currentLaggai = parseFloat(finalOddsData.lgaai);
      let currentKhaai = parseFloat(finalOddsData.khaai);

      if (
        matchData.bookmakerRange &&
        matchData.bookmakerRange != 0 &&
        currentKhaai != 0
      ) {
        currentKhaai = currentLaggai + matchData.bookmakerRange / 100;
      }


        if (type == "K" && currentKhaai < odds) {
            odds = currentKhaai
        }
      
      
        if (type == "L" && currentLaggai > odds) {
             odds = currentLaggai
        }

      
      // if (type == "L" && odds + oddsRange < currentLaggai) {
      //   return returnResponse("error", "odds Expire");
      // }

      // if (type == "L" && odds - oddsRange > currentLaggai) {
      //   return returnResponse("error", "odds Expire");
      // }

      // if ((type == "K" || type == "k") && odds + oddsRange < currentKhaai) {
      //   return returnResponse("error", "odds Expire");
      // }

      // if ((type == "K" || type == "k") && odds - oddsRange > currentKhaai) {
      //   return returnResponse("error", "odds Expire");
      // }


      if (type == "L") {
        if (
          currentLaggai != odds ||
          currentLaggai < 0 ||
          currentLaggai == 0 ||
          odds < 0 ||
          odds == 0
        ) {
          return returnResponse("error", "odds Expire");
        }
      }

      if (type == "L" && currentLaggai > 10) {
        return returnResponse(
          "error",
          "we can not accept bets greater than 10 "
        );
      }


      if (type == "K" || type == "k") {
        if (
          currentKhaai != odds ||
          currentKhaai < 0 ||
          currentKhaai == 0 ||
          odds < 0 ||
          odds == 0
        ) {
          return returnResponse("error", "odds Expire");
        }
      }

      if (
        (finalOddsData.khaai === 0 && finalOddsData.lgaai === 0) ||
        odds === 0
      ) {
        return returnResponse("error", "odds Expire");
      }
    }

    if (oddsType == "toss") {
      if (type != "L") {
        return returnResponse("error", "something went wrong in oddsType");
      }
      checkOddsData = oddsData.toss_data;
      sendOddsData = convertKeyObject(checkOddsData, "selectionid");
      finalOddsData = sendOddsData[selectionId + ""];

      if (finalOddsData.lgaai != 0 && matchData && matchData.tossRate && matchData.tossRate != 0 && matchData.tossRate > 0) {
        finalOddsData.lgaai = Number(matchData.tossRate)
      }

      if (type == "L" && parseFloat(finalOddsData.lgaai) != parseFloat(odds)) {
        return returnResponse("error", "odds Expire");
      }


      if (
        (finalOddsData.khaai === 0 && finalOddsData.lgaai === 0) ||
        odds === 0
      ) {
        return returnResponse("error", "odds Expire");
      }
    }

    if (betAmount > oddsMaxAmount) {
      status = "error";
      message = `Maximum Odds Amount Is Acceptable Is ${oddsMaxAmount}`;
      return returnResponse(status, message);
    }

    if (betAmount < oddsMinAmount) {
      status = "error";
      message = `Minimum Odds Amount Is Acceptable Is ${oddsMinAmount}`;
      return returnResponse(status, message);
    }

  } else if (betFor === "fancy" && (gtype == "fancy" || gtype == "betfair")) {
    oddsData = oddsData.result
    let run = reqData.run;
    let sessionData = oddsData.session;

    // _d(oddsData.session , "oddsData.session")
    if (gtype == "betfair") {
      sessionData = oddsData.lineMarketData
    }
    if (sessionData) {
      sessionData = convertKeyObject(sessionData, "session_id");
    }

    let finalSessionData = [];

    if (sessionData[selectionId + ""]) {
      finalSessionData = sessionData[selectionId + ""];
    }

    if (type != "N" && type != "Y") {
      return returnResponse("error", "Something Went Wrong in fancy bet type");
    }

    if (!finalSessionData || finalSessionData == []) {
      status = "error";
      message = `Session Data Not Coming Please Try After Some Time`;
      return returnResponse(status, message);
    }

    if (
      finalSessionData.max &&
      finalSessionData.max != 0 &&
      settingData.isFancyMaxAmountCheck
    ) {
      sessionMaxAmount = Math.round(finalSessionData.max);
    }

    if (betAmount > sessionMaxAmount) {
      status = "error";
      message = `Maximum Fancy Amount Is Acceptable Is ${sessionMaxAmount}`;
      return returnResponse(status, message);
    }
    if (betAmount < sessionMinAmount) {
      status = "error";
      message = `Minimum Fancy Amount Is Acceptable Is ${sessionMinAmount}`;
      return returnResponse(status, message);
    }
    sendOddsData = finalSessionData;


    

     if (type == "Y" && finalSessionData.runsYes <= run) {
        run = finalSessionData.runsYes
     }
    
    if (type == "N" && finalSessionData.runsNo >= run) {
        run = finalSessionData.runsNo
    }
    
    if (gtype == "betfair") {
      finalSessionData.oddsNo = 1
      finalSessionData.oddsYes = 1
    }

 
    if (
      run < 1 ||
      odds == 0 
    ) {
      status = "error";
      message = `odds expire`;
      return returnResponse(status, message);
    }

    if(type == "Y"  && finalSessionData.oddsYes == 0) {
      status = "error";
      message = `odds expire`;
      return returnResponse(status, message);
    }

    if(type == "N" && finalSessionData.oddsNo == 0) {
      status = "error";
      message = `odds expire`;
      return returnResponse(status, message);
    }




    if (
      (finalSessionData.runsNo < 1 ||
        finalSessionData.runsYes < 1) && gtype != "betfair"
    ) {
      status = "error";
      message = `odds expire`;
      return returnResponse(status, message);
    }


    if (type == "N") {
      if (finalSessionData.runsNo != run || finalSessionData.oddsNo != odds) {
        status = "error";
        message = `No Run Session Expire`;
        return returnResponse(status, message);
      }
    }

    if (type == "Y") {
      if (finalSessionData.runsYes != run || finalSessionData.oddsYes != odds) {
        status = "error";
        message = `Yes Run Session Expire`;
        return returnResponse(status, message);
      }
    }
  } else if (oddsTypesUsingMarketCache.has(betFor)) {

    if (oddsData.error) {
      return returnResponse("error", "odds Expire");
    }

    oddsData = oddsData.data ? oddsData.data : oddsData

  
    if (oddsData.length < 1) {
      return returnResponse("error", "odds Expire due to lenth issue");
    }

    oddsData = oddsData[0];


    if (oddsData.marketId) {
      betfairMarketId = oddsData.marketId
    }


    if (oddsData.status != "OPEN") {
      return returnResponse("error", "market Is Not Open");
    }


    if (oddsData.marketId != reqData.betfairMarketId) {
      return returnResponse("error", "something wrong in betfair marketId");
    }

    let runners = oddsData.runners;

    let finalData = await deconstructMarketData(runners, reqData, settingData);


    if (!finalData.status) {
      let isOpenBets = settingData.isOpenBets ? settingData.isOpenBets : false
      if (reqData.isOpenBet || matchData.sportId != 4) {
        isOpenBets = false
      }
      if (betFor == "matchOdds" && isOpenBets) {
        let returnOpenBets = await saveOpenBets(reqData, matchData)
        if (returnOpenBets.status != "success") {
          return returnOpenBets
        } else {
          return returnResponse("success", "isOpenBets");
        }
      } else {
        return returnResponse("error", finalData.message ? finalData.message : "odds Expire");
      }
    }

    let odds = finalData.data;
    sendOddsData = odds;

    if (sendOddsData.lgaai < 0 || sendOddsData.khaai < 0) {
      return returnResponse("error", "odds Expire");
    }

    let teamData = JSON.parse(matchData.teamData);
    let countTeam = teamData.length;

    let sportId = matchData.sportId
    let maxOddsAllow = 15
    let maximumOddsAllowData = betfairMaximumAllowOddsBySportWise
    if (maximumOddsAllowData[sportId]) {
      let maxOddsAllowData = maximumOddsAllowData[sportId]
      if (maxOddsAllowData?.maxOdds) {
        maxOddsAllow = maxOddsAllowData?.maxOdds
      }
    }

    if (!isCombined) {
      if (sendOddsData.lgaai > maxOddsAllow || sendOddsData.khaai > maxOddsAllow) {
        return returnResponse("error", `we can accept bet more then ${maxOddsAllow} odds`);
      }

      if (countTeam == 3 && sportId == 4) {
        if (sendOddsData.lgaai > 10 || sendOddsData.khaai > 10) {
          return returnResponse("error", "we can accept bet more then 10 odds");
        }
      }

      let teamName = odds.team_name
      if (matchData.sportId == 1 && /goals?/i.test(teamName)) {
        oddsMaxAmount = settingData && settingData.maxFootballGoalLineAmt ? settingData.maxFootballGoalLineAmt : oddsMaxAmount
      }
      
      if (betAmount > oddsMaxAmount) {
        status = "error";
        message = `Maximum Odds Amount Is Acceptable Is ${oddsMaxAmount}`;
        return returnResponse(status, message);
      }


      if (betAmount < oddsMinAmount) {
        status = "error";
        message = `Minimum Odds Amount Is Acceptable Is ${oddsMinAmount}`;
        return returnResponse(status, message);
      }


    }
  } else if (betFor === "fancy" && (gtype == "cricketcasino")) {
    oddsData = oddsData.result
    const run = reqData.run;
    let sessionData = oddsData.meterKhadoSession;
    if (sessionData) {
      sessionData = convertKeyObject(sessionData, "session_id");
    }

    let finalSessionData = [];

    if (sessionData[selectionId + ""]) {
      finalSessionData = sessionData[selectionId + ""];
    }

    if (!finalSessionData || finalSessionData == []) {
      status = "error";
      message = `Session Data Not Coming Please Try After Some Time`;
      return returnResponse(status, message);
    }

    if (
      finalSessionData.max &&
      finalSessionData.max != 0 &&
      settingData.isFancyMaxAmountCheck
    ) {
      sessionMaxAmount = Math.round(finalSessionData.max);
    }

    if (betAmount > sessionMaxAmount) {
      status = "error";
      message = `Maximum Fancy Amount Is Acceptable Is ${sessionMaxAmount}`;
      return returnResponse(status, message);
    }
    if (betAmount < sessionMinAmount) {
      status = "error";
      message = `Minimum Fancy Amount Is Acceptable Is ${sessionMinAmount}`;
      return returnResponse(status, message);
    }
    sendOddsData = finalSessionData;


    let runningStatus = finalSessionData.running_status

    if (runningStatus == "Suspended" || runningStatus == "suspended") {
      status = "error";
      message = `Figure Odds Suspended`;
      return returnResponse(status, message);
    }

    sendOddsData.fancyType = fancyType
    sendOddsData.gtype = gtype



  } else if (betFor === "fancy" && gtype == "oddeven") {
    oddsData = oddsData.result
    const run = reqData.run;
    let sessionData = oddsData.meterKhadoSession;
    if (sessionData) {
      sessionData = convertKeyObject(sessionData, "session_id");
    }

    let finalSessionData = [];

    if (sessionData[selectionId + ""]) {
      finalSessionData = sessionData[selectionId + ""];
    }

    if (!finalSessionData || finalSessionData == []) {
      status = "error";
      message = `Session Data Not Coming Please Try After Some Time`;
      return returnResponse(status, message);
    }

    if (
      finalSessionData.max &&
      finalSessionData.max != 0 &&
      settingData.isFancyMaxAmountCheck
    ) {
      sessionMaxAmount = Math.round(finalSessionData.max);
    }

    if (betAmount > sessionMaxAmount) {
      status = "error";
      message = `Maximum Fancy Amount Is Acceptable Is ${sessionMaxAmount}`;
      return returnResponse(status, message);
    }
    if (betAmount < sessionMinAmount) {
      status = "error";
      message = `Minimum Fancy Amount Is Acceptable Is ${sessionMinAmount}`;
      return returnResponse(status, message);
    }
    sendOddsData = finalSessionData;


    let runningStatus = finalSessionData.running_status

    if (runningStatus == "Suspended" || runningStatus == "suspended") {
      status = "error";
      message = `Figure Odds Suspended`;
      return returnResponse(status, message);
    }

    sendOddsData.fancyType = fancyType
    sendOddsData.gtype = gtype



  } else {
    return returnResponse("error", "bet for wrong coming");
  }

  if (matchData && (matchData.sportId == 7 || matchData.sportId == 4339)) {
    betfairMarketId = marketId
  }
  matchData.betfairMarketId = betfairMarketId ? betfairMarketId : marketId

  let returnData = {
    matchData: matchData,
    liveOdds: sendOddsData,
    settingData: settingData ? settingData : [],
    betfairMarketList: betfairMarketList ? betfairMarketList : []
  };

  return returnResponse(status, message, returnData);
};

const checkUserData = async (userId) => {
  const userData = await UserModel.findOne(
    {
      _id: userId,
      status: 1,
      isDeleted: false,
    },
    {
      transactionPassword: 0,
      password: 0,
      mobile: 0,
      passwordShow: 0,
      userPriority: 0,
      status: 0,
      isDeleted: 0,
      reference: 0,
      isPasswordChanged: 0,
      isRent: 0,
      otp: 0,
      referral: 0,
    }
  );
  if (!userData) {
    return returnResponse(
      "error",
      "Something Went Wrong In User Creation Please Contact Admin"
    );
  }
  return returnResponse("success", "Data Found", userData);
};

const updatePlayModel = async (clientId, marketId, updateObject) => {
  await PlayModel.updateOne(
    { clientId: clientId, marketId: marketId },
    updateObject
  );
};

// const checkPlayDataMarketWise = async (userData, marketId, type = "odds") => {
//   let playData = {};
//   try {
//     const key = `playDataByMarketId_${marketId}_${userData._id}`;
//     let redisPlayData = await client.get(key);
//     if (redisPlayData && redisPlayData != null && redisPlayData != "") {
//       return JSON.parse(redisPlayData);
//     }

//     playData = await PlayModel.findOne({
//       userId: userData._id,
//       marketId: marketId,
//     });


//     if (!playData) {

//       let [shareData, directUserShareData] = await Promise.all([
//         ShareModel.findOne({ userId: userData._id }),
//         directUserShareModel.findOne({ userId: userData._id }),
//       ])

//       //const shareData = await ShareModel.findOne({ userId: userData._id });
//       const matchShareData = getClientShareArray(shareData, "match", userData);
//       playData = {
//         marketId: marketId,
//         ownerId: userData.ownerId,
//         subownerId: userData.subownerId,
//         adminId: userData.adminId,
//         superadminId: userData.superadminId,
//         superagentId: userData.superagentId,
//         subadminId: userData.subadminId,
//         masterId: userData.masterId,
//         agentId: userData.agentId,
//         clientId: userData.clientId,
//         userId: userData._id,
//         parentData: userData?.parentData,
//         playStatus: 1,
//         shareData: JSON.stringify(matchShareData.matchShareArray),
//         userInfo: {
//           username: userData.username,
//           name: userData.name,
//         },
//         directUserShareData: JSON.stringify(directUserShareData?.shareData)
//       };
//       if (type == "odds") {
//         playData.isMatchPlay = true
//       }
//       await PlayModel.create(playData);
//     }
//     await client.set(key, JSON.stringify(playData))
//     return playData;
//   } catch (error) {
//     console.log("checkPlayDataMarketWise Error", error);
//     return playData;
//   }
// };


const checkPlayDataMarketWise = async (userData, marketId, type = "odds") => {
  let playData = {};
  try {
    const key = `playDataByMarketId_${marketId}_${userData._id}`;

    let redisPlayData = await client.get(key);
    if (redisPlayData) {
      return JSON.parse(redisPlayData);
    }

    let [shareData, directUserShareData] = await Promise.all([
      ShareModel.findOne({ userId: userData._id }),
      directUserShareModel.findOne({ userId: userData._id }),
    ]);

    const matchShareData = getClientShareArray(
      shareData,
      "match",
      userData
    );

    const insertData = {
      marketId: marketId,
      ownerId: userData.ownerId,
      subownerId: userData.subownerId,
      adminId: userData.adminId,
      superadminId: userData.superadminId,
      superagentId: userData.superagentId,
      subadminId: userData.subadminId,
      masterId: userData.masterId,
      agentId: userData.agentId,
      clientId: userData.clientId,
      userId: userData._id,
      parentData: userData?.parentData,
      playStatus: 1,
      shareData: JSON.stringify(matchShareData.matchShareArray),
      userInfo: {
        username: userData.username,
        name: userData.name,
      },
      directUserShareData: JSON.stringify(
        directUserShareData?.shareData
      ),
      isMatchPlay: type === "odds",
    };

    playData = await PlayModel.findOneAndUpdate(
      {
        userId: userData._id,
        marketId: marketId,
      },
      {
        $setOnInsert: insertData,
      },
      {
        new: true,
        upsert: true,
      }
    );

    await client.set(key, JSON.stringify(playData));
    return playData;
  } catch (error) {
    console.log("checkPlayDataMarketWise Error", error);
    if (error.code === 11000) {
      return await PlayModel.findOne({
        userId: userData._id,
        marketId: marketId,
      });
    }

    return playData;
  }
};


const insertBetDataIntoRedis = async (userData, marketId, betData) => {
  const redisData = await checkPlayDataMarketWise(userData, marketId);
  redisData.matchBetData = JSON.stringify(betData);
  let playData = redisData;
  await client.hmset(`${marketId}`, `${userData._id}`, JSON.stringify(playData));
};

const betMatchPositionLive = (oddsData, reqData) => {
  const type = reqData.type;
  const betSelectionId = reqData.selectionId;
  const betAmount = parseFloat(reqData.amount);
  const betOdds = parseFloat(reqData.odds);
  let positionArray = {};
  for (const [key, odds] of Object.entries(oddsData)) {
    const oddsSelectionId = odds.selectionid;
    if (type == "L" && oddsSelectionId == betSelectionId) {
      positionArray[oddsSelectionId] = betAmount * betOdds;
    } else if (type === "K" && oddsSelectionId == betSelectionId) {
      positionArray[oddsSelectionId] = -1 * betAmount * betOdds;
    } else if (type === "L" && oddsSelectionId != betSelectionId) {
      positionArray[oddsSelectionId] = -1 * betAmount;
    } else if (type === "K" && oddsSelectionId != betSelectionId) {
      positionArray[oddsSelectionId] = betAmount;
    } else {
      positionArray[oddsSelectionId] = -1 * betAmount;
    }
  }
  return positionArray;
};

const betsMatchPosition = async (oldMatchBet, teamData, oddsType) => {
  let positionArray = {};
  for (const [key, team] of Object.entries(teamData)) {
    const teamSelectionId = team.selection_id;
    positionArray[teamSelectionId] = 0;
    for (const [teamKey, bets] of Object.entries(oldMatchBet)) {
      let hit = true;
      if (oddsType && bets.oddsType != oddsType) {
        hit = false;
      }
      if (hit) {
        const betSelectionId = bets.selectionId;
        const betAmount = parseFloat(bets.amount);
        const betOdds = parseFloat(bets.odds);
        const type = bets.type.toUpperCase();
        if (type == "K" && betSelectionId == teamSelectionId) {
          positionArray[teamSelectionId] +=
            -1 * betAmount * parseFloat(betOdds);
        }
        if (type == "K" && betSelectionId != teamSelectionId) {
          positionArray[teamSelectionId] += betAmount;
        }
        if (type == "L" && betSelectionId == teamSelectionId) {
          positionArray[teamSelectionId] += betAmount * betOdds;
        }
        if (type == "L" && betSelectionId != teamSelectionId) {
          positionArray[teamSelectionId] += -1 * betAmount;
        }
      }
    }
  }
  return positionArray;
};

const getSessionPositon = async (
  sessionBetsList,
  specificAmount,
  loggedInData
) => {
  let userTypeMinusPlus = -1;
  if (loggedInData.userType == "client") {
    userTypeMinusPlus = 1;
  }
  const runsData = sessionBetsList.map((data) => {
    return data.run;
  });
  const uniqueRunArray = removeDuplicates(runsData);
  const nextRunArray = uniqueRunArray.map((insideRun) => {
    return [insideRun - 1, insideRun, insideRun + 1];
  });
  const uniqueValues = new Set();
  const runsResult = [];

  for (const runsArray of nextRunArray) {
    runsArray.map((runs) => {
      if (!uniqueValues.has(runs)) {
        uniqueValues.add(runs);
        runsResult.push(runs);
      }
    });
  }
  finalArray = [];
  runsResult.map((uniqueRun) => {
    sessionBetsList.map((betsData) => {
      let pushObj = [];
      pushObj.run = uniqueRun;
      if (specificAmount) {
        betsData.amount = userTypeMinusPlus * betsData[specificAmount];
      }
      if (uniqueRun >= betsData.run && betsData.type == "Y") {
        pushObj.position = Math.round(betsData.amount * betsData.odds);
      } else if (uniqueRun >= betsData.run && betsData.type == "N") {
        pushObj.position = Math.round(-1 * betsData.amount * betsData.odds);
      } else if (uniqueRun < betsData.run && betsData.type == "Y") {
        pushObj.position = Math.round(-1 * betsData.amount);
      } else if (uniqueRun < betsData.run && betsData.type == "N") {
        pushObj.position = Math.round(betsData.amount);
      }
      finalArray.push(pushObj);
    });
  });
  let finalRunArray = {};
  finalArray.map((runsData) => {
    if (finalRunArray.hasOwnProperty(runsData.run)) {
      finalRunArray[runsData.run] += Math.round(runsData.position);
    } else {
      finalRunArray[runsData.run] = Math.round(runsData.position);
    }
  });
  return finalRunArray;
};

const getFancyBetList = async (
  where,
  specific,
  amountSort,
  idSort,
  bodyData = {}
) => {
  try {
    if (!where) {
      return {};
    }
    let sessionData = {};
    let sortObj = {};
    let specificObj = "";
    if (specific) {
      specificObj = specific;
    }

    if (amountSort) {
      sortObj.amount = -1;
    }

    sortObj._id = -1;
    
    if (bodyData.size && bodyData.pageNo) {
      sessionData = await FancyBetModel.find(where)
        .select(specificObj)
        .sort(sortObj)
        .skip(bodyData.size * (bodyData.pageNo - 1))
        .limit(bodyData.size);
    } else {
      sessionData = await FancyBetModel.find(where)
        .select(specificObj)
        .sort(sortObj);
    }
    return sessionData;
  } catch (error) {
    console.log("fetching fancy Bet List Error In Bet Service", error);
  }
};

const getOddsBetList = async (where, specific, bodyData = {}) => {
  try {
    if (!where) {
      return {};
    }
    if (bodyData.size && bodyData.pageNo) {
      return await BetModel.find(where)
        .select(specific)
        .sort({ _id: -1 })
        .skip(bodyData.size * (bodyData.pageNo - 1))
        .limit(bodyData.size);
    } else {
      return await BetModel.find(where).select(specific).sort({ _id: -1 });
    }
  } catch (error) {
    console.log("fetching Odds Bet List Error In Bet Service", error);
  }
};

const getCasinoBetList = async (where, specific) => {
  try {
    if (!where) {
      return {};
    }
    let casinoBetData = {};
    if (specific) {
      casinoBetData = await CasinoBetModel.find(where).select(specific);
    } else {
      casinoBetData = await CasinoBetModel.find(where);
    }
    return casinoBetData;
  } catch (error) {
    console.log("fetching Casino Bet List Error In Bet Service", error);
  }
};

const getPlayData = async (where, specific, all) => {
  if (!all) {
    return await PlayModel.findOne(where).select(specific);
  } else {
    return await PlayModel.find(where).select(specific);
  }
};

const saveSportsList = async () => {
  _d(`match list save script start at ${_date_time()}`);
  try {
    let hitUrl = fetchUrl.matchListData;
    let responseData = await axios.get(hitUrl);


    let matchList = [];
    if (responseData.data) {
      responseData.data.map(async (value, key) => {
        let tvUrl = "";
        let scoreIframe = "";
        let marketId = value.market_id;

        let insertMatch = false;

        if (value.sports_id == 4) {
          tvUrl = siteSetting.matchTvUrl + value.event_id;
          scoreIframe = siteSetting.iframeCricketScore + value.event_id;
          scoreIframe2 = siteSetting.iframeCricketScore2 + value.event_id;
        } else {
          tvUrl = siteSetting.tennisSoccerTvUrl + value.event_id;
          scoreIframe2 = siteSetting.iframeTennisSoccerScore + value.event_id;
          scoreIframe =
            siteSetting.iframeTennisSoccerScore2 +
            value.sports_id +
            "&eventId=" +
            value.event_id;
        }

        let matchData = {
          matchName: value.match_name,
          sportName: value.match_name,
          marketId: marketId,
          matchDate: value.match_date,
          matchType: value.match_type,
          eventId: value.event_id,
          sportId: value.sports_id,
          priority: value.priority,
          notification: value.notification,
          betDelayTime: value.bet_delay_time,
          tvId: value.tv_id,
          socketPerm: true,
          socketUrl: siteSetting.socketUrl,
          checkOddsUrl: siteSetting.checkMatchDataUrl + marketId,
          cacheUrl: `${siteSetting.checkMatchDataUrl}` + marketId,
          otherMarketCacheUrl:
            `${fetchUrl.otherMarketOddsUrlEventWise}` + value.event_id,
          tvUrl: tvUrl,
          scoreIframe: scoreIframe,
          scoreIframe2: scoreIframe2,
          betPerm: value.bet_perm,
          decisionStatus: value.desicion_status,
          seriesName: value.series_name,
          status: value.status,
          wonTeamName: value.won_team_name,
          maxMinCoins: value.coins_setting,
          teamData: value.team_data_array,
          seriesId: value.series_id,
          betDelaySetting: {
            tieBetDelay: 0,
            completedBetDelay: 0,
            bookMakerBetDelay: 0,
            matchOddsBetDelay: 0,
            tossBetDelay: 0,
          },
        };

        let isMatchExists = await sportsListModel.countDocuments({
          marketId: marketId,
        });

        if (isMatchExists == 0) {
          try {
            if (
              siteSetting.IS_TV_FETCH_URL &&
              siteSetting.IS_TV_FETCH_URL == true
            ) {
              let tvUrlAxios = `${siteSetting.TV_URL_FETCH}${value.event_id}`;
              let tvData = await axios.get(tvUrlAxios);
              if (tvData.data) {
                tvData = tvData.data;
                if (tvData.data) {
                  tvData = tvData.data;
                  if (tvData.hitUrl) {
                    matchData.tvUrl = tvData.hitUrl;
                  }
                }
              }
            }

            await insertBetfairMarket(market.eventId)
          } catch (error) {
            console.log("fetch match data list error");
          }

          await sportsListModel.updateOne(
            { marketId: marketId },
            { $set: matchData },
            { upsert: true }
          );
        }
      });
    }
    await setSportsInRedis();
    _d(`match list save script end at ${_date_time()}`);
    return matchList;
  } catch (error) {
    console.log("save Sports List Fetching Error", error);
    return error;
  }
};

const getMatchList = async (marketId) => {
  try {
    let fetchFromDatabase = true;
    let returnData = {};
    returnData = await client.get("inplayMatchList");

    if (returnData) {
        returnData = JSON.parse(returnData);
        fetchFromDatabase = false;
    }
    
    if (fetchFromDatabase) {
      returnData = await sportsListModel.find({
        status: {
          $in: ["INPLAY", "UPCOMING"],
        },
      });
      if (siteSetting.IS_REDIS) {
        await setSportsInRedis(returnData);
      }
    }
    
    let sendData = {};
    if (marketId) {
      returnData = returnData.map((data) => {
        if (data.marketId == marketId) {
          sendData = data;
        }
      });
    } else {
      sendData = returnData;
    }
    return sendData;
  } catch (error) {
    console.log("Match List Fetching Error", error);
    return error;
  }
};

const getCasinoList = async (shortName) => {
  let hitUrl = fetchUrl.casinoListData;
  if (shortName) {
    hitUrl = hitUrl + "?shortName=" + shortName;
  }
  try {
    let responseData = await axios.get(hitUrl);
    let casinoList = [];
    if (responseData.data) {
      let finalData = responseData.data.data;
      finalData.map((value, key) => {
        let tvNo = `url${value.url_status}`;
        const tvUrl = value[tvNo];
        casinoData = {
          casinoName: value.casino_name,
          shortName: value.shortName,
          eventId: value.casino_event_id,
          maxBetAmountAccept: value.max_limit,
          minBetAmountAccept: value.min_limit,
          betStatus: value.bet_accept_status,
          betMsg: value.bet_status_msg,
          socketPerm: value.socket_perm,
          socketUrl: value.socketUrl,
          cacheUrl: value.cacheFetchUrl,
          tvUrl: tvUrl,
        };
        casinoList.push(casinoData);
      });
    }
    return casinoList;
  } catch (error) {
    console.log("Casino List Fetching Error", error);
    return error;
  }
};

const getMatkaList = async (eventId) => {
  let hitUrl = fetchUrl.matkaListData;
  if (eventId) {
    hitUrl = hitUrl + "?eventID=" + eventId;
  }
  try {
    let responseData = await axios.get(hitUrl);
    let matkaList = [];
    let finalData = responseData.data.data;

    return finalData;
  } catch (error) {
    console.log("Casino List Fetching Error", error);
    return error;
  }
};

const insertOddsPosition = async (marketId, clientId, insertData) => {
  await OddsPositionModel.deleteMany({
    userId: new ObjectId(clientId),
    marketId: marketId + "",
  });
  const insert = await OddsPositionModel.insertMany(insertData);
  return true;
};

// const getSessionList = async (userWhere) => {
//   try {
//     var res = await FancyBetModel.aggregate([
//       {
//         $match: userWhere,
//       },
//       {
//         $group: {
//           _id: "$selectionId",
//           sessionNames: { $addToSet: "$sessionName" },
//           isDeclare: { $first: "$isDeclare" },
//           decisionRun: { $first: "$decisionRun" },
//           fancyType: { $first: "$fancyType" },
//           gtype: { $first: "$gtype" },
//           totalClientBetAmount: { $sum: "$amount" },
//           totalSessionBets: { $sum: 1 },
//         },
//       },
//       {
//         $project: {
//           _id: 0,
//           selectionId: "$_id",
//           sessionNames: 1,
//           totalClientBetAmount: 1,
//           totalSessionBets: 1,
//           decisionRun: 1,
//           isDeclare: 1,
//           fancyType: 1,
//           gtype: 1,
//         },
//       },
//     ]);
//     return res;
//   } catch (error) {
//     console.log("Session List Fetching Error", error);
//     return error;
//   }
// };


const getSessionList = async (userWhere = {}) => {
  try {
    const pipeline = [
      { $match: { ...userWhere } },
      {
        $project: {
          selectionId: 1,
          sessionName: 1,
          isDeclare: { $ifNull: ["$isDeclare", false] },
          isDeleted: { $ifNull: ["$isDeleted", false] },
          decisionRun: { $ifNull: ["$decisionRun", null] },
          fancyType: { $ifNull: ["$fancyType", null] },
          gtype: { $ifNull: ["$gtype", null] },
          amount: { $ifNull: ["$amount", 0] },
        },
      },
      {
        $group: {
          _id: {
            selectionId: "$selectionId",
            fancyType: { $ifNull: ["$fancyType", null] },
            gtype: { $ifNull: ["$gtype", null] },
          },
          sessionNames: { $addToSet: "$sessionName" },
          selectionId: { $first: "$selectionId" },
          _isDeclareAny: { $max: { $cond: ["$isDeclare", 1, 0] } },
          _isDeletedAny: { $max: { $cond: ["$isDeleted", 1, 0] } },
          _decisionRunSet: { $addToSet: "$decisionRun" },
          _fancyTypeSet: { $addToSet: "$fancyType" },
          _gtypeSet: { $addToSet: "$gtype" },
          totalClientBetAmount: { $sum: "$amount" },
          totalSessionBets: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          selectionId: 1,
          sessionNames: 1,
          isDeclare: { $eq: ["$_isDeclareAny", 1] },
          isDeleted: { $eq: ["$_isDeletedAny", 1] },
          decisionRun: {
            $let: {
              vars: {
                nonNull: { $setDifference: ["$_decisionRunSet", [null]] }
              },
              in: {
                $cond: [
                  { $gt: [{ $size: "$$nonNull" }, 1] },
                  "$$nonNull",
                  { $arrayElemAt: ["$$nonNull", 0] }
                ]
              }
            }
          },
          fancyType: {
            $let: {
              vars: { nonNull: { $setDifference: ["$_fancyTypeSet", [null]] } },
              in: {
                $cond: [
                  { $gt: [{ $size: "$$nonNull" }, 1] },
                  "$$nonNull",
                  { $arrayElemAt: ["$$nonNull", 0] }
                ]
              }
            }
          },
          gtype: {
            $let: {
              vars: { nonNull: { $setDifference: ["$_gtypeSet", [null]] } },
              in: {
                $cond: [
                  { $gt: [{ $size: "$$nonNull" }, 1] },
                  "$$nonNull",
                  { $arrayElemAt: ["$$nonNull", 0] }
                ]
              }
            }
          },

          totalClientBetAmount: 1,
          totalSessionBets: 1,
        },
      },
      { $sort: { selectionId: 1 } },
    ];
    const res = await FancyBetModel
      .aggregate(pipeline)
      .option({ allowDiskUse: true });

    return res;
  } catch (error) {
    console.error("Session List Fetching Error", error);
    return [];
  }
};

const getOddsPosition = async (userData, marketId, bodyData = {}) => {
  try {
    const loggedInData = userData;
    const userId = loggedInData.userId;
    const userType = loggedInData.userType;
    let userTypeId = `${userType}Id`;
    let userTypeAmount = `${userType}Amount`;
    if (userType == "client") {
      userTypeAmount = "amount";
    }
    let whereQuery = {
      [userTypeId]: new ObjectId(userId),
      marketId: marketId,
    };

    if (bodyData.userId && bodyData.userType) {
      whereQuery = {
        [bodyData.userType + "Id"]: new ObjectId(bodyData.userId),
        marketId: marketId,
      };
    }

    if (bodyData.oddsType) {
      whereQuery.oddsType = bodyData.oddsType
    }

    // _d(whereQuery , "whereQuery")

    let positionData = await OddsPositionModel.aggregate([
      {
        $match: whereQuery,
      },
      {
        $group: {
          _id: "$selectionId",
          Position: { $sum: "$" + userTypeAmount },
          totalPosition: { $sum: "$amount" },
          oddsType: { $first: "$oddsType" },
          teamName: { $first: "$teamName" },
        },
      },
    ]);

    return positionData;
  } catch (error) {
    console.log("Odds Position Fetch error in Bet Controller", error);
    return SendResponse(
      res,
      "error",
      "Odds Position Fetch error in Bet Controller",
      error
    );
  }
};

const getOddsPositionByMarketWise = async (userData, marketId) => {
  try {
    const loggedInData = userData;
    const userId = loggedInData.userId;
    const userType = loggedInData.userType;
    let userTypeId = `${userType}Id`;
    let userTypeAmount = `${userType}Amount`;

    if (userType == "client") {
      userTypeAmount = "amount";
    }

    let whereQuery = {
      [userTypeId]: new ObjectId(userId),
      marketId: marketId,
    };

    let positionData = await OddsPositionModel.aggregate([
      {
        $match: whereQuery,
      },
      {
        $group: {
          _id: "$selectionId",
          Position: { $sum: "$" + userTypeAmount },
          totalPosition: { $sum: "$amount" },
          oddsType: { $first: "$oddsType" },
          teamName: { $first: "$teamName" },
          marketId: { $first: "$marketId" },
        },
      },
    ]);
    return positionData;
  } catch (error) {
    console.log("Odds Position Fetch error in Bet Controller", error);
    return SendResponse(
      res,
      "error",
      "Odds Position Fetch error in Bet Controller",
      error
    );
  }
};

const loginReportsByMarketId = async (where) => {
  try {
    const loggedInUser = await PlayModel.find(where, {
      parentData: 1,
      createdAt: 1,
      userInfo: 1,
    });
    let pushArray = [];
    loggedInUser.map((data) => {
      pushArray.push(data);
    });

    return pushArray;
  } catch (error) {
    console.log("user Login Report Error", error);
    return SendResponse(res, "error", "user Login Report Error", error);
  }
};

const setSportsInRedis = async (returnData) => {
  try {
    if (!returnData) {
      returnData = await sportsListModel.find({
        status: {
          $in: ["INPLAY", "UPCOMING"],
        },
        isDeclare: false,
      });
    }

    if (siteSetting.IS_REDIS) {
      await client.set("inplayMatchList", JSON.stringify(returnData));
      await client.expire("inplayMatchList", 60 * 10);
      returnData.map(async (data, key) => {
        await client.set(`${data.marketId}_data`, JSON.stringify(data));
        await client.expire(`${data.marketId}_data`, 60 * 60 * 24);
      });
    }

    return returnData;
  } catch (error) {
    console.log("Match List update in redis Error", error);
    return error;
  }
};

const sportByMarketId = async (marketId) => {
  let matchData = [];
  if (siteSetting.IS_REDIS) {
    const data = await client.get(`${marketId}_data`);
    if (data) {
      matchData = JSON.parse(data);
      return matchData;
    }
  }

  if (matchData.length == 0) {
    matchData = await sportsListModel.findOne({
      marketId: marketId,
    });
    if (siteSetting.IS_REDIS && matchData) {
      await client.set(`${marketId}_data`, JSON.stringify(matchData));
      await client.expire(`${marketId}_data`, 60 * 60 * 24);
    }
  }
  return matchData;
};

const updateMatchByMarketId = async (bodyData) => {
  if (!bodyData.marketId) {
    return returnResponse("error", "marketId is Required");
  }
  let matchData = await sportsListModel.findOne({
    marketId: bodyData.marketId,
  });
  if (!matchData) {
    return returnResponse("error", "sports Not Found");
  }
  const marketId = bodyData.marketId;
  delete bodyData.marketId;
  delete bodyData.eventId;
  delete bodyData.teamData;
  delete bodyData.isDeclare;
  const update = await sportsListModel.updateMany(
    { marketId: marketId },
    bodyData
  );

  if (siteSetting.IS_REDIS) {
    let returnData = await sportsListModel.find({
      status: {
        $in: ["INPLAY", "UPCOMING"],
      },
    });

    await setSportsInRedis(returnData);
  }

  return returnResponse("success", "", matchData);
};

const sessionPositionUserWise = async (userData, marketId) => {
  const loggedInData = userData;
  const userId = loggedInData.userId;
  const userType = loggedInData.userType;
  let userTypeId = `${userType}Id`;
  let userTypeAmount = `${userType}Amount`;
  if (userType == "client") {
    userTypeAmount = "amount";
  }
  let whereQuery = {
    [userTypeId]: new ObjectId(userId),
    marketId: marketId,
    isDeclare: 0,
    forBet: 1,
    overallType: "fancyOdds",
  };
  var resData = await TransactionLogModel.aggregate([
    {
      $match: whereQuery,
    },
    {
      $group: {
        _id: "$selectionId",
        position: { $sum: `$${userTypeAmount}` },
        remarks: { $first: `$remarks` },
      },
    },
  ]);
  return resData;
};



const saveSportsListByNewCenterPanel = async () => {
  _d(`match list save script start at ${_date_time()}`);
  try {
    let settingData = await getSettingData();
    let matchHitUrl = `${settingData.nodeCenterPanel}`
    let betfairHitUrlExceptMatch = `${settingData.racingCenterPanel}`
    let racingHitUrl = `${settingData.racingCenterPanel}`

    if (settingData.betfairSocketUrl) {
      betfairHitUrlExceptMatch = `${settingData.betfairSocketUrl}v1/centerPanel/matchListByDatabaseGet?status=INPLAY&isMarket=true`
      racingHitUrl = settingData.betfairSocketUrl + "v1/centerPanel/getRacingSportsData?status=INPLAY";
    }

    if (settingData.socketUrl) {
      matchHitUrl = `${settingData.socketUrl}v1/centerPanel/matchListByDatabaseGet?status=INPLAY&isMarket=true`
    }


    let matchResponceData = {}
    let betfairResponceDataExceptMatch = {}

    let [matchData, betfairSportsDataExceptMatch, racingData] = await Promise.all([
      axios.get(matchHitUrl),
      axios.get(betfairHitUrlExceptMatch),
      axios.get(racingHitUrl),
    ])


    if (matchData?.data?.data) {
      let matchRes = matchData?.data?.data
      matchResponceData = matchRes.filter(
        (item) => item.sportId === 4
      );
    }


    if (betfairSportsDataExceptMatch?.data?.data) {
      const betfairRes = betfairSportsDataExceptMatch.data.data;
      betfairResponceDataExceptMatch = betfairRes.filter(
        (item) => ![4, '4'].includes(item.sportId)
      );
    }



    await Promise.all([
      saveSportsData(matchResponceData, settingData),
      saveSportsData(betfairResponceDataExceptMatch, settingData),
      saveRacingEvents(racingData, settingData),
    ])

    await Promise.all([
      setSportsInRedis(),

    ])

    return true
  } catch (error) {
    console.log("save Sports List Fetching Error", error);
    return error;
  }
};

const saveSportsData = async (sportData, settingData) => {
  if (sportData) {
    await Promise.all(
      sportData.map(async (value, key) => {
        let marketId = value.marketId;
        let eventId = value.eventId;
        let tvUrl = settingData.tvProxyUrl + eventId;
        let scoreIframe = settingData.scoreUrl + eventId;
        let scoreIframe2 = settingData.scoreUrl2 + eventId;
        let socketUrl = settingData.socketUrl
        let betfairSocketUrl = settingData.betfairSocketUrl ? settingData.betfairSocketUrl : settingData.socketUrl
        let checkOddsUrl = `${socketUrl}v2/api/oddsDataNew?market_id=${marketId}`
        let otherMarketCacheUrl = `${betfairSocketUrl}v2/api/dataByEventId?eventId=${eventId}`
        if (value.sportId != 4) {
          scoreIframe = settingData.scoreUrlTennis + eventId;
          scoreIframe2 = settingData.scoreUrlTennis2 + eventId;
          socketUrl = betfairSocketUrl
          checkOddsUrl = `${betfairSocketUrl}v2/api/oddsDataNew?market_id=${marketId}`
        }
        let cacheUrl = checkOddsUrl

        let teamDataFinal = [];
        value.teamData.map(async (team) => {
          let pushTeam = {
            selection_id: team.bookmakerSelectionId,
            market_id: marketId,
            runner_name: team.runnerName,
            bookmakerSelectionId: team.bookmakerSelectionId,
            betfairSelectionId: team.betfairSelectionId,
          };
          teamDataFinal.push(pushTeam);
        });

        let maxMinCoinSetting = {
          maximum_match_bet: settingData.maxBookmakerAmt,
          minimum_match_bet: settingData.minBookmakerAmt,
          maximum_session_bet: settingData.maxSessionAmt,
          minimum_session_bet: settingData.minSessionAmt,
          maximum_tie_coins: settingData.maxTieOddsAmt,
          maximum_completed_coins: settingData.maxTieOddsAmt,
          maximum_matchOdds_coins: settingData.maxMatchOddsAmt,
          maximum_toss_coins: settingData.maxTossOddsAmt,
        };

        if (settingData.maxTennisOddsAmt && value.sportId == 2 ) {
          maxMinCoinSetting.maximum_matchOdds_coins = settingData.maxTennisOddsAmt
        }

        if (settingData.maxFootballOddsAmt && value.sportId == 1 ) {
          maxMinCoinSetting.maximum_matchOdds_coins = settingData.maxFootballOddsAmt
        }

        let matchData = {
          matchName: value.matchName,
          sportName: value.matchName,
          marketId: marketId,
          matchDate: value.matchDate,
          matchType: value.matchType,
          eventId: eventId,
          sportId: value.sportId,
          priority: value.priority,
          notification: "",
          betDelayTime: settingData.betDelay,
          socketPerm: settingData.isSocketPerm
            ? settingData.isSocketPerm
            : true,
          betfairSocketUrl: betfairSocketUrl,
          socketUrl: socketUrl,
          checkOddsUrl: checkOddsUrl,
          cacheUrl: cacheUrl,
          otherMarketCacheUrl: otherMarketCacheUrl,
          tvUrl: tvUrl,
          scoreIframe: scoreIframe,
          scoreIframe2: scoreIframe2,
          betPerm: true,
          seriesName: value.seriesName,
          status: value.status,
          wonTeamName: value.wonBookmakerTeamName,
          maxMinCoins: maxMinCoinSetting,
          teamData: JSON.stringify(teamDataFinal),
          seriesId: value.seriesId,
          sportType: value.sportType,
          bookmakerRange: settingData.bookmakerRange
            ? settingData.bookmakerRange
            : 0,
          betDelaySetting: {
            tieBetDelay: 0,
            completedBetDelay: 0,
            bookMakerBetDelay: value.betDelay
              ? value.betDelay
              : settingData.betDelay,
            matchOddsBetDelay: settingData.matchOddsBetDelay
              ? settingData.matchOddsBetDelay
              : value.betDelay,
            tossBetDelay: 0,
            lineMarketfancyBetDelay: settingData.matchOddsBetDelay
              ? settingData.matchOddsBetDelay
              : 0,
          },
          tossRate: settingData.tossRate ? Number(settingData.tossRate) : 0
        };


       // _d(matchData.maxMinCoins)


        let isMatchExists = await sportsListModel.countDocuments({
          marketId: marketId,
        });

        if (isMatchExists == 0) {

          try {
            let marketData = await insertBetfairMarket(eventId, matchData , settingData)
            if (marketData.data) {
              matchData.marketList = marketData?.data;
            }
          } catch (e) {
            console.log(e, "fetching error in marketList");
          }

          try {
            if (settingData.tvUrlFetchByCenterpanel) {
              let tvUrlAxios = `${settingData.tvFetchUrl}${eventId}`;
              let tvData = await axios.get(tvUrlAxios);
              if (tvData.data) {
                tvData = tvData.data;
                if (tvData.data) {
                  tvData = tvData.data;
                  if (tvData.hitUrl) {
                    matchData.tvUrl = tvData.hitUrl;
                  }
                }
              }
            }

          } catch (error) {
            console.log("fetch match data list error");
          }

          let update = await sportsListModel.updateOne(
            { marketId: marketId },
            { $set: matchData },
            { upsert: true }
          );
        }
      }));
  }

}

const saveRacingEvents = async (racingData = {}, settingData = {}) => {
  try {
    if (!settingData) {
      settingData = await getSettingData();
    }
    let allowSportsId = []
    if (settingData.isHourse) {
      allowSportsId.push(7)
    }
    if (settingData.isGreyHound) {
      allowSportsId.push(4339)
    }

    let matchList = [];

    if (!racingData) {
      let hitUrl = settingData.betfairSocketUrl + "v1/centerPanel/getRacingSportsData?status=INPLAY";
      let responseData = await axios.get(hitUrl);
      racingData = responseData.data.data;
    } else {
      racingData = racingData.data.data;
    }

    if (racingData) {
      await Promise.all(
        racingData.map(async (value, key) => {
          if (allowSportsId.includes(Number(value.sportId))) {
            let marketId = value.marketId;
            let eventId = value.eventId;
            let insertMatch = false;
            let tvUrl = settingData.tvProxyUrl + value.marketId;
            let scoreIframe =
              settingData.scoreUrlTennis +
              value.sportId +
              "&eventId=" +
              value.eventId;
            let scoreIframe2 = settingData.scoreUrlTennis2 + value.eventId;
            let teamDataFinal = [];
            let runnerData = value.runnerData
            runnerData.map(async (team) => {
              let pushTeam = {
                selection_id: team.selectionId,
                market_id: marketId,
                runner_name: team.runnerName,
                bookmakerSelectionId: team.sortPriority,
                betfairSelectionId: team.selectionId,
                jockeyName: team.jockeyName,
                trainerName: team.trainerName,
                age: team.age,
                sortPriority: team.sortPriority,
                metaData: team.metaData ? team.metaData : {}
              };
              teamDataFinal.push(pushTeam);
            });


            let maxMinCoinSetting = {
              maximum_match_bet: settingData.maxBookmakerAmt,
              minimum_match_bet: settingData.minBookmakerAmt,
              maximum_session_bet: settingData.maxSessionAmt,
              minimum_session_bet: settingData.minSessionAmt,
              maximum_tie_coins: settingData.maxTieOddsAmt,
              maximum_completed_coins: settingData.maxTieOddsAmt,
              maximum_matchOdds_coins: settingData.maxMatchOddsAmt,
              maximum_toss_coins: settingData.maxTossOddsAmt,
            };


            if (settingData.maxHorseRacingOddsAmt && value.sportId == 7 ) {
              maxMinCoinSetting.maximum_matchOdds_coins = settingData.maxHorseRacingOddsAmt
            }

            if (settingData.maxGreyHoundOddsAmt && value.sportId == 4339 ) {
              maxMinCoinSetting.maximum_matchOdds_coins = settingData.maxGreyHoundOddsAmt
            }

            let betfairSocketUrl = settingData.betfairSocketUrl
            let socketUrl = betfairSocketUrl
            let checkOddsUrl = `${betfairSocketUrl}v2/api/oddsDataNew?market_id=${marketId}`
            let otherMarketCacheUrl = `${betfairSocketUrl}v2/api/dataByEventId?eventId=${eventId}`

            let matchData = {
              matchName: value.trackName,
              sportName: value.matchName,
              sportType: value.sportType,
              countryCode: value.countryCode,
              marketId: marketId,
              matchDate: value.startDateTime,
              matchType: "racing",
              eventId: value.eventId,
              sportId: value.sportId,
              notification: "",
              betDelayTime: settingData.matchOddsBetDelay ? settingData.matchOddsBetDelay : 5,
              socketPerm: settingData.isSocketPerm
                ? settingData.isSocketPerm
                : true,
              socketUrl: socketUrl,
              betfairSocketUrl: betfairSocketUrl,
              checkOddsUrl: checkOddsUrl,
              cacheUrl: checkOddsUrl,
              otherMarketCacheUrl: otherMarketCacheUrl,
              tvUrl: tvUrl,
              scoreIframe: scoreIframe,
              scoreIframe2: scoreIframe2,
              betPerm: true,
              seriesName: value.countryCode,
              status: value.status,
              wonTeamName: value.wonBookmakerTeamName,
              maxMinCoins: JSON.stringify(maxMinCoinSetting),
              teamData: JSON.stringify(teamDataFinal),
              seriesId: value.sportId,
              bookmakerRange: settingData.bookmakerRange
                ? settingData.bookmakerRange
                : 0,
              betDelaySetting: {
                tieBetDelay: 0,
                completedBetDelay: 0,
                bookMakerBetDelay: value.betDelay
                  ? value.betDelay
                  : settingData.betDelay,
                matchOddsBetDelay: settingData.matchOddsBetDelay
                  ? settingData.matchOddsBetDelay
                  : 5,
                tossBetDelay: 0,
              },
              marketName: value.marketName
            };

            let isMatchExists = await sportsListModel.countDocuments({
              marketId: marketId,
            });



            if (isMatchExists == 0) {
              try {
                let marketData = await insertBetfairMarketForRacing(value.eventId, matchData, runnerData)

                if (marketData.data) {
                  matchData.marketList = marketData?.data;
                }

              } catch (e) {
                console.log(e, "fetching error in marketList");
              }


                try {
                    if (settingData.tvUrlFetchByCenterpanel) {
                      const tvUrlAxios = `${settingData.tvFetchUrl}${marketId}`;
                      const tvRes = await axios.get(tvUrlAxios, { timeout: 5000 });
                      const hitUrl = tvRes?.data?.data?.hitUrl;
                      if (hitUrl) matchData.tvUrl = hitUrl;
                    } else {
                      if (matchData.sportId == 7) {
                        matchData.tvUrl = `${process.env.TV_CALL_URL}7777`
                      }
                      
                      if (matchData.sportId == 4339) {
                        if (matchData.seriesName == "AU") {
                          matchData.tvUrl =  `${process.env.TV_CALL_URL}3332`
                        } else {
                          matchData.tvUrl =  `${process.env.TV_CALL_URL}2222`
                        }
                      }
                    }
                  } catch (err) {
                    console.log("TV URL Fetch Error:", err.message);
                  }
              
              
              
              await sportsListModel.updateOne(
                { marketId: marketId },
                { $set: matchData },
                { upsert: true }
              );
            }

          }
        }));
    }
    await setSportsInRedis();
    _d(`match list save script end at ${_date_time()}`);
    return matchList;

  } catch (error) {
    console.log("save Sports List Fetching Error", error);
    return error;
  }
};



const insertBetfairMarketForRacing = async (eventId, sportData = {}, runners) => {
  if (runners.length > 0) {
    runners.map((teamData, key) => {
      runners[key].runnerName = teamData.runnerName
    })
    teamSelectionData = runners
  }
  let marketId = sportData.marketId


  
  let pushData = {
    marketId: sportData.marketId,
    marketType: "Match Odds",
    eventId: sportData.eventId,
    matchName: sportData.matchName,
    sportName: sportData.matchName,
    sportId: sportData.sportId,
    seriesId: sportData.seriesId,
    status: sportData.status,
    selectionIdData: teamSelectionData,
    playStatus: true,
    betDelay: 0,
    maxBet : 0
  };

  let finalData = []
  finalData.push(pushData)
  let matchData = { marketList: finalData };
  await sportsListModel.updateOne({ marketId: marketId }, { $set: finalData });
  await sportsMarketListModel.deleteMany({ marketId: marketId });
  let updateSportsList = await sportsMarketListModel.create(finalData);
  returnData = finalData
  return returnResponse("success", "betfair market updated successfully", finalData);
};

const OpenBetsMatchPosition = async (oldMatchBet, teamData, oddsType) => {
  let positionArray = {};
  for (const [key, team] of Object.entries(teamData)) {
    const teamSelectionId = team.selection_id;
    positionArray[teamSelectionId] = 0;
    for (const [teamKey, bets] of Object.entries(oldMatchBet)) {
      const betSelectionId = bets.selectionId;
      const betAmount = parseFloat(bets.amount);
      const betOdds = parseFloat(bets.odds - 1);
      const type = bets.type.toUpperCase();
      if (type == "K" && betSelectionId == teamSelectionId) {
        positionArray[teamSelectionId] +=
          -1 * betAmount * parseFloat(betOdds);
      }
      if (type == "K" && betSelectionId != teamSelectionId) {
        positionArray[teamSelectionId] += betAmount;
      }
      if (type == "L" && betSelectionId == teamSelectionId) {
        positionArray[teamSelectionId] += betAmount * betOdds;
      }
      if (type == "L" && betSelectionId != teamSelectionId) {
        positionArray[teamSelectionId] += -1 * betAmount;
      }
    }
  }
  return positionArray;
};

 
function calculateCombinedOddsNew(selections = [], runners = [] , type) {
  try {
    if (!Array.isArray(selections) || selections.length < 2) {
      return { error: "Minimum 2 selections required" };
    }
 
    if (!Array.isArray(runners) || runners.length === 0) {
      return { error: "Runners data required" };
    }
 
    let totalInverse = 0;

    const individualOdds = [];
 
    selections.forEach((selectionId) => {

      const runner = runners.find(r => r.selectionId === selectionId);
 
      if (!runner) return;

      let price = type == "L" ? runner?.ex?.availableToBack?.[0]?.price : runner?.ex?.availableToLay?.[0]?.price
     
     
 
      if (price && !isNaN(price)) {

        individualOdds.push(price);

        totalInverse += 1 / price;

      }

    });
 
    if (totalInverse === 0) {

      return { error: "Invalid odds data" };

    }
 
    const combinedOdds = (1 / totalInverse) - 1;
 
    return {

      selections,

      individualOdds,

      combinedOdds: Number(combinedOdds.toFixed(2)),

      totalInverse: Number(totalInverse.toFixed(6))

    };
 
  } catch (error) {

    console.error("Combined Odds Error:", error);

    return { error: "Something went wrong" };

  }

}

const insertBetfairMarket = async (eventId, sportData = {} , settingData={}) => {
  if (!sportData.otherMarketCacheUrl) {
    sportData = await sportsListModel.findOne({ eventId: eventId })
  }
  let marketData = {}
  let hitUrl = `${sportData?.betfairSocketUrl}v1/centerPanel/getSportDataByEventId?eventId=${eventId}`
  let fetchOddsData = await axios.get(hitUrl);
  if (fetchOddsData.data) {
    marketData = fetchOddsData
  }

  let returnData = []
  if (marketData.data.data) {
    let marketList = marketData?.data?.data?.marketData;
    if (marketList) {
      returnData = await updateBetfairMarket(eventId, marketList , sportData) 
    }
  }

  return returnResponse(returnData.status, returnData.message, returnData.data);
};


const updateBetfairMarket = async (eventId , marketList , sportData) => {
  let returnData = []
  let allMarket = [];

    marketList.map((market) => {
      let runners = []
      let teamSelectionData = []
      if (market.teamSelectionData) {
        teamSelectionData = JSON.parse(market.teamSelectionData)
      }
      if (market.runners) {
        runners = market.runners
      }
      if (runners.length > 0) {
        runners.map((teamData, key) => {
          runners[key].runnerName = teamData.selectionName ? teamData.selectionName : teamData.runnerName
        })
        teamSelectionData = runners
      }

      if (market.selectionIdData) {
        teamSelectionData = market.selectionIdData
      }

      let marketType = market.market_type ? market.market_type : market.marketType
      if (!marketType && market.marketName) {
       marketType =  market.marketName
      }

      const playStatusKey = Object.hasOwn(market, "playStatus");
      let playStatus = playStatusKey ? market.playStatus  : true
      let betDelay = market.betDelay ? market.betDelay : 0
      let maxBet = market.maxBet ? market.maxBet : 0

      let pushData = {
        marketId: market.market_id ? market.market_id : market.marketId,
        marketType:marketType ,
        eventId: sportData.eventId,
        matchName: sportData.matchName,
        sportName: sportData.matchName,
        sportId: sportData.sportId,
        seriesId: sportData.seriesId,
        status: sportData.status,
        selectionIdData: teamSelectionData,
        playStatus: playStatus,
        betDelay: betDelay,
        maxBet: maxBet
      };
      allMarket.push(pushData);
    });
  
  

  let previourMarketList = sportData?.marketList || [];
  
  let newMarketList = Object.values(allMarket || {});
  
  let merged = [...previourMarketList, ...newMarketList];
  
  let map = new Map();
  
  for (let item of merged) {
      map.set(item.marketId, item);
  }
  
  let matchData = {
      marketList: allMarket
  };

  
  
  
  
    const update = await sportsListModel.findOneAndUpdate(
        { eventId: eventId },
        { $set: matchData },
        { new: true } // returns updated doc
      );
      
  
  
  
  
  await sportsMarketListModel.deleteMany({ eventId: eventId });
  await sportsMarketListModel.create(allMarket)
  


  // if (allMarket.length > 0) {
  //     const bulkOps = allMarket.map((market) => ({
  //       updateOne: {
  //         filter: {
  //           eventId: market.eventId,
  //           marketId: market.marketId, // unique field
  //         },
  //         update: {
  //           $set: market,
  //         },
  //         upsert: true,
  //       },
  //     }));
  //     await sportsMarketListModel.bulkWrite(bulkOps);
  // }
  

      
      await setSportsInRedis();

    return returnResponse("success", "betfair market updated successfully", allMarket);
};

 

module.exports = {
  checkLiveMatchOdds,
  checkUserData,
  checkPlayDataMarketWise,
  betMatchPositionLive,
  betsMatchPosition,
  insertBetDataIntoRedis,
  getSessionPositon,
  getFancyBetList,
  getOddsBetList,
  getPlayData,
  getMatchList,
  updatePlayModel,
  insertOddsPosition,
  getSessionList,
  getCasinoList,
  getMatkaList,
  getCasinoBetList,
  getOddsPosition,
  loginReportsByMarketId,
  saveSportsList,
  setSportsInRedis,
  sportByMarketId,
  updateMatchByMarketId,
  getOddsPositionByMarketWise,
  sessionPositionUserWise,
  insertBetfairMarket,
  saveSportsListByNewCenterPanel,
  saveRacingEvents,
  insertBetfairMarketForRacing,
  getNewOpenBetsPosition,
  calculateCombinedOddsNew,
  updateBetfairMarket
};
