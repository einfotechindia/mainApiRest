const { centerpanelRedis } = require("../Helpers/RedisHelper.js");
const { emitToRoom } = require("../socket.js")
const { SendResponse } = require("../Helpers/ResponseMapper");
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
} = require("../Helpers/CommonHelper");
require("dotenv").config();
const CryptoJS = require("crypto-js");

const fetchSportsListByRedis = async () => {
   let allEvent = await centerpanelRedis.get(`allEventId`);
    if (allEvent) {
    allEvent = JSON.parse(allEvent);
    }
   return allEvent;
};

const throughFancyBookmakerBySocket = async (req, res) => {
  try {
    const sportData = await fetchSportsListByRedis();
    if (!sportData?.length) {
      console.warn("⚠️ No market data found in Redis");
      return res ? SendResponse(res, "success", "No Data Found") : true;
    }
  
    const results = await Promise.allSettled(
      sportData.map(async ({ eventId, marketId }) => {
        let saveData = {
          session: [],
          team_data: [],
          toss_data: [],
          meterKhadoSession: [],
          lineMarketData: [],
        };
          
        try {
          let [tossData, bookmakerData, fancyData, meterKhadoSession, lineMarketData , manualFancyData] = await Promise.all([
            centerpanelRedis.get(`tossData_${eventId}`),
            centerpanelRedis.get(`bookmakerData_${eventId}`),
            centerpanelRedis.get(`fancyData_${eventId}`),
            centerpanelRedis.get(`fancyDataMeterKhado_${eventId}`),
            centerpanelRedis.get(`betfairFancyData_${eventId}`),
            centerpanelRedis.get(`manualFancyDataAllNew_${eventId}`),
          ]);

          if (tossData) saveData.toss_data = JSON.parse(tossData);
          if (bookmakerData) saveData.team_data = JSON.parse(bookmakerData);
          if (fancyData) saveData.session = JSON.parse(fancyData);
          if (meterKhadoSession) saveData.meterKhadoSession = JSON.parse(meterKhadoSession);
          if (lineMarketData) saveData.lineMarketData = JSON.parse(lineMarketData);

          if (manualFancyData) {
            manualFancyData = JSON.parse(manualFancyData)
            manualFancyData.length > 0 && manualFancyData.map((mdata) => {     
              saveData.session.push(mdata)
             })
          }

          // const encryptedData = CryptoJS.AES.encrypt(
          //       JSON.stringify({ result: saveData }),
          //       process.env.DATA_ENCRUPTION_KEY
          // ).toString();

      
          try {
            emitToRoom(marketId , JSON.stringify({ result: saveData }) , marketId )
          } catch (emitErr) {
            console.error(`❌ Socket emit failed for ${marketId}:`, emitErr.message);
          }

          return { marketId, status: "success" };
          
        } catch (err) {
          console.error(`⚠️ Error processing eventId: ${eventId}`, err.message);
          return { marketId, status: "failed", error: err.message };
        }
      })
    );

    // 🔹 Summary logging
    const fulfilledCount = results.filter(r => r.status === "fulfilled").length;
    const rejectedCount = results.filter(r => r.status === "rejected").length;

    console.log(`✅ Processed: ${fulfilledCount}, ❌ Failed: ${rejectedCount}`);

    if (res) {
      return SendResponse(res, "success", `✅ Processed: ${fulfilledCount}, ❌ Failed: ${rejectedCount}`);
    } else {
      return true;
    }

  } catch (err) {
    console.error("🔥 Critical error in throughFancyBookmakerBySocket:", err);
    if (res) {
      return SendResponse(res, "error", "Internal Server Error");
    } else {
      return false;
    }
  }

};

module.exports = {
    throughFancyBookmakerBySocket
}
