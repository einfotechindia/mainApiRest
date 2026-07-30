const express = require("express");
const router = express.Router();
const { centerPanelAuth } = require("../../Middlewares/CenterPanelAuth");
const { verifyToken, isOwnerAndStaff } = require("../../Middlewares/VerifyToken");
const C = require("../../Controllers/CenterPanel/CenterPanel.controller");

// Staff Panel: View logs (normal JWT auth)
router.post("/logs", verifyToken, isOwnerAndStaff, C.GetCenterPanelLogs);

// CenterPanel Secured APIs (HMAC-SHA256)
router.post("/bookmakerDecision", centerPanelAuth, C.BookmakerDecision);
router.post("/betfairDecisionAutomatic", centerPanelAuth, C.BetfairDecisionAutomatic);
router.post("/betfairDecisionManual", centerPanelAuth, C.BetfairDecisionManual);
router.post("/fancyDecision", centerPanelAuth, C.FancyDecision);
router.post("/fancyRollback", centerPanelAuth, C.FancyRollback);
router.post("/cancelFancy", centerPanelAuth, C.CancelFancy);
router.post("/betsDelete", centerPanelAuth, C.BetsDelete);
router.post("/betfairMarketDecision", centerPanelAuth, C.BetfairMarketDecision);
router.post("/bookmakerOddsAutomatic", centerPanelAuth, C.BookmakerOddsAutomatic);
router.post("/fancyAutomaticDecision", centerPanelAuth, C.FancyAutomaticDecision);

module.exports = router;
