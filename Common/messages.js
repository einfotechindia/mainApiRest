/**
 * PROJECT-WISE MESSAGES
 *
 * Structure:
 *   "category.key": {
 *     "default": "Default message for all projects",
 *     "projectName": "Override for specific project"
 *   }
 *
 * Rules:
 *   - "default" key MANDATORY hai har message mein
 *   - Project-specific key sirf tab likho jab message alag ho
 *   - Agar project key nahi mili → default use hoga
 *   - Placeholders: {amount}, {username} etc. — dynamically replace hote hain
 *
 * Usage:
 *   const { msg } = require("../Helpers/MessageHelper");
 *   msg("bet.success")                          → project ke hisaab se message
 *   msg("bet.fastBet", { timer: 3 })            → placeholder replace
 *   msg("transaction.insufficientCoins")         → default if project key missing
 */

module.exports = {

  // ============================================================
  // AUTH / LOGIN
  // ============================================================
  "auth.invalidCredentials": {
    default: "Invalid username or password",
    // crickexpo: "Wrong username or password. Please try again.",
    // winx777: "Login failed. Check your credentials.",
  },
  "auth.accountLocked": {
    default: "Your account is locked. Please contact your agent",
  },
  "auth.accountInactive": {
    default: "Your account is inactive. Please contact your agent",
  },
  "auth.sessionExpired": {
    default: "Session expired. Please login again",
  },
  "auth.unauthorizedAccess": {
    default: "Unauthorized access",
  },
  "auth.tokenRequired": {
    default: "Token Required",
  },
  "auth.authTokenRequired": {
    default: "Authtoken Required ! Please Login Again",
  },
  "auth.userNotFound": {
    default: "User not found",
  },
  "auth.tokenExpired": {
    default: "Token expired ! Please login again",
  },
  "auth.staffNotFound": {
    default: "Staff not found",
  },
  "auth.noPermission": {
    default: "You don't have {action} permission for this action",
  },
  "auth.notAuthorised": {
    default: "You are not authorised to access this",
  },
  "auth.invalidUser": {
    default: "User validation failed: Account status set to inactive or does not exist",
  },
  "auth.genericError": {
    default: "Authentication failed. Please login again",
  },
  "auth.sessionExpiredRelogin": {
    default: "Your session has expired. Please login again.",
  },
  "auth.loggedInElsewhere": {
    default: "Your account has been logged in from another device. Please login again.",
  },
  "auth.balanceRateLimited": {
    default: "Too many requests. Please wait.",
  },
  "auth.botDetected": {
    default: "Request blocked.",
  },
  "auth.tooManyLoginAttempts": {
    default: "Too many login attempts. Please try after {minutes} minutes.",
  },
  "auth.invalidCredentials": {
    default: "Invalid user name or password",
  },
  "auth.userInactive": {
    default: "You Are Inactive Please Active First By Upperline",
  },
  "auth.domainNotAllowed": {
    default: "User credentials are wrong",
  },

  // ============================================================
  // TRANSACTION / COINS
  // ============================================================
  "transaction.coinsUpdatedSuccess": {
    default: "Coins Updated Successfully",
  },
  "transaction.insufficientCoins": {
    default: "User doesn't have sufficient coins.",
  },
  "transaction.invalidAmount": {
    default: "Invalid coins amount.",
  },
  "transaction.selfTransferBlocked": {
    default: "You cannot transfer coins to yourself.",
  },
  "transaction.userInactive": {
    default: "User is inactive, Please active first.",
  },
  "transaction.creatorInactive": {
    default: "Creator is inactive, Please active first.",
  },
  "transaction.transactionPasswordRequired": {
    default: "Transaction Password Is required",
  },
  "transaction.transactionPasswordWrong": {
    default: "Transaction Password Is Wrong",
  },
  "transaction.negativeCoinsDropped": {
    default: "Operation dropped: coins would go negative.",
  },
  "transaction.coinsUpdateFailed": {
    default: "Coins update failed. Please try again.",
  },
  "transaction.receiverUpdateFailed": {
    default: "Receiver is inactive or coins could not be updated.",
  },
  "transaction.unauthorizedHierarchy": {
    default: "Unauthorized hierarchy operation.",
  },
  "transaction.maxDebit": {
    default: "Maximum {maxCoins} coins can be debited for user: {username}",
  },

  // ============================================================
  // BET PLACEMENT
  // ============================================================
  "bet.oddsSuccess": {
    default: "{oddsType} Bets Placed Successfully",
    crickexpo: "Your {oddsType} bet is confirmed!",
    winx777: "{oddsType} Bet Done!",
  },
  "bet.sessionSuccess": {
    default: "Session Bet Placed Successfully",
  },
  "bet.invalidAmount": {
    default: "Invalid Amount",
  },
  "bet.invalidFancyAmount": {
    default: "Invalid Fancy Amount",
  },
  "bet.betLocked": {
    default: "Your bet is locked please contact your agent",
  },
  "bet.marketBlocked": {
    default: "Market Is Blocked",
  },
  "bet.onlyClientAllowed": {
    default: "Only client Authorized to place bet",
  },
  "bet.fastBet": {
    default: "We can not accept your bet due to fast bet under {timer} Sec",
  },
  "bet.betProcessing": {
    default: "Previous bet is still processing. Please wait.",
  },
  "bet.rateLimited": {
    default: "Only 1 bet is allowed per second. Please wait.",
  },
  "bet.userPlacingBet": {
    default: "User is placing bet, Please try after some time.",
  },
  "bet.executionTimeout": {
    default: "Execution response time out",
  },
  "bet.oddsExpired": {
    default: "Odds expired",
  },
  "bet.openBetNotFound": {
    default: "Open Bet Not Found",
  },
  "bet.openBetCancelled": {
    default: "Open bets cancelled successfully",
  },
  "bet.invalidFancyTypeAmount": {
    default: "Invalid {fancyType} Amount For {sessionName}",
  },
  "bet.marketClosed": {
    default: "Market Is Closed",
  },
  "bet.minSize": {
    default: "Min Size Is {minSize}",
  },
  "bet.maxSize": {
    default: "Max Size Is {maxSize}",
  },
  "bet.onlyMultiBets": {
    default: "Only multi bets is accepted",
  },
  "bet.zeroNegativeOdds": {
    default: "Zero or negative odds can not be accepted",
  },

  // ============================================================
  // DECISION / RESULT REMARKS
  // ============================================================
  "decision.oddsRemark": {
    default: "{oddsType} Result declared for ({matchName})",
  },
  "decision.sessionRemark": {
    default: "{sessionName}",
  },
  "decision.sessionCrickRemark": {
    default: "{sessionName} - {matchName}-{seriesName}",
  },
  "decision.sessionCommRemark": {
    default: "{sessionName} Comm",
  },
  "decision.sessionCommCrickRemark": {
    default: "{sessionName} - {matchName}-{seriesName}",
  },
  "decision.sessionStatementRemark": {
    default: "({sessionName}) {winLoss} - Result ({decisionRun})",
  },
  "decision.sessionCommStatementRemark": {
    default: "{sessionName} Comm credited",
  },
  "decision.sessionSocketRemark": {
    default: "You {winLoss} {amount} for {sessionName}",
  },
  "decision.sessionSuccessMsg": {
    default: "Fancy Bet Successfully Done for {sessionName}",
  },
  "decision.rollbackSuccessMsg": {
    default: "Fancy Rollback Successfully Done",
  },
  "decision.casinoResultRemark": {
    default: "Casino Result for {gameName}",
  },
  "decision.casinoRemark": {
    default: "{casinoName}",
  },
  "decision.matkaRemark": {
    default: "Matka Result for {matkaName}",
  },
  "decision.rollbackRemark": {
    default: "Result rollback for ({matchName})",
  },
  "decision.oddsCommRemark": {
    default: "User Comm For Match ({matchName})",
  },
  "decision.oddsWinRemark": {
    default: "{wonTeamName} Win The Match",
  },
  "decision.commSubmittedRemark": {
    default: "Comm submitted for {username} ({name})",
  },
  "decision.casinoLedgerRemark": {
    default: "{casinoName} ({date})",
  },

  // ============================================================
  // DIAMOND CASINO
  // ============================================================
  "diamond.betRemark": {
    default: "{casinoType} ({eventId}) bet for roundId {roundId} for {playerName}",
  },
  "diamond.statementRemark": {
    default: "Diamond CasinoBet For {casinoType} Of ({roundId}) for player {playerName}",
  },
  "diamond.commRemark": {
    default: "Diamond Casino Comm for {marketId}",
  },
  "diamond.commCreditRemark": {
    default: "diamond casino comm credit for {casinoName} ({date})",
  },
  "diamond.casinoLedgerRemark": {
    default: "{casinoName} ({date})",
  },
  "diamond.ledgerDeclareRemark": {
    default: "Diamond Casino Ledger For ({casinoName} - {date})",
  },
  "diamond.socketWinLossRemark": {
    default: "You {winLoss} {amount} for {casinoType} ({roundId})",
  },
  "diamond.resultAlreadyGoing": {
    default: "Result already going on",
  },
  "diamond.noBetsFound": {
    default: "No bets found",
  },
  "diamond.resultSaved": {
    default: "Result saved successfully",
  },
  "diamond.betsUpdated": {
    default: "Bets updated successfully",
  },
  "diamond.ledgerDeclareSuccess": {
    default: "Ledger Declare Successfully For Date {date}",
  },
  "diamond.onlyOwnerAuthorised": {
    default: "Only owner authorised to update bets",
  },
  "diamond.dateRequired": {
    default: "Date is required",
  },
  "diamond.noUndeclaredRounds": {
    default: "No undeclared round IDs",
  },
  "diamond.cacheUrlNotFound": {
    default: "Cache URL not found",
  },
  "diamond.noValidResults": {
    default: "No valid results received",
  },
  "diamond.crickRemark": {
    default: "diamondCasino - {betRemarks} / -({date})",
  },
  "diamond.crickRemarkComm": {
    default: "diamondCasino - {betRemarks} / -({date}) - Commission",
  },
  "diamond.aviatorCrickRemark": {
    default: "Avaitor-Vig-({date})",
  },
  "diamond.betfairCrickRemark": {
    default: "betfairCasino - {roundId} - {casinoType} / -({date})",
  },

  // ============================================================
  // STATEMENT REMARKS
  // ============================================================
  "statement.depositRemark": {
    default: "Coins deposit from {oldAmount} to {newAmount} AND Received From {creatorName} ({creatorUsername}) by {parentUsername}-({parentName})",
  },
  "statement.withdrawRemark": {
    default: "Coins withdraw from {oldAmount} to {newAmount} AND Received From {creatorName} ({creatorUsername}) by {parentUsername}-({parentName})",
  },
  "statement.coinsUpdatedTo": {
    default: "Coins updated to {userName} ({username}) by {parentUsername}",
  },
  "statement.betPlacedRemark": {
    default: "{oddsType} Odds for ({matchName})",
  },
  "statement.sessionBetRemark": {
    default: "{sessionName}",
  },
  "statement.casinoBetRemark": {
    default: "Casino bet for {gameName}",
  },

  // ============================================================
  // CRICK TRANSACTION REMARKS
  // ============================================================
  "crick.depositRemark": {
    default: "{userRemark}[Deposit To {username} by {creatorUsername} of {amount}- ({dateTime})]",
  },
  "crick.withdrawRemark": {
    default: "{userRemark}[Withdraw From {username} by {creatorUsername} of {amount} - ({dateTime})]",
  },
  "crick.decisionRemark": {
    default: "Result for {matchName} - {selectionName}",
  },

  // ============================================================
  // DEPOSIT WITHDRAW TYPE
  // ============================================================
  "depositWithdraw.depositTo": {
    default: "deposit to {username}",
  },
  "depositWithdraw.withdrawFrom": {
    default: "withdraw from {username}",
  },
};
