module.exports = Object.freeze({
    REGISTRATION_SUCCESS_MESSAGE: "You are successfully registered. We have sent an email, please verify  your account.",
    ALREDY_EMAIL_REGISTER_BY_ADMIN: "Your email is already register with us. Please reset your password",
    REGISTRATION_FAILURE_MESSAGE: "Sorry for inconvenience! Facing something wrong while processing your request.",
    REGISTRATION_DEVICE_ID_FAIL: "Please Register With Same Device as You Verified Earliar.",
    LOGIN_SUCCESS: "You are successfully logged in.",
    UPDATE_PASSWORD_SUCCESS: "Your password is successfully updated.",
    UPDATE_PASSWORD_FAILURE: "Sorry for inconvenience! Facing something wrong while processing your request.",
    FAILED_MSG: "Sorry for inconvenience! Facing something wrong while processing your request.",
    IP_ALREADY_EXIST: "Ip already exist",

    GET_NEW_ADDRESS_SUCCESS: "New address created successfully.",
    GET_NEW_ADDRESS_FAILURE: "Error to create new address.",

    UPLOAD_SELFIE: "Please upload selfie .",
    UPLOAD_PAN: "Please upload pan card .",
    UPLOAD_AADHAR: "Please upload aadhar card .",

    OVERVIEW_SUCCESS: "Success.",
    OVERVIEW_FAILURE: "Error to OVERVIEW.",
    SUCCESS: "Success.",
    NOT_FOUND: "Not found.",
    NOTIFICATION_SUCCESS: "We will contact you soon.",
    FAILURE: "Failed.",
    TUESDAY_WITHDRAW: "Withdrawl can only done in Tuesday, So please try to withdrawl in tuesday.",

    SEND_SUCCESS: "Success.",
    MANUAL_SUCCESS: "This email used. Please try use new one or contact to admin.",
    INSUFFICIENT_BALANCE: "Insufficient balance.",
    SEND_OTP_TX: "We have sent otp to your email address.",
    INVALID_ADDRESS: "Invalid address.",
    SEND_FAILURE: "Error to SEND.",


    ALREADY_DONE: "already done.",
    ALREADY_EXIST: "Already exist.",
    EMAIL_ALREADY_EXIST: "Email already exist.",
    INVALID_OTP: "Invalid OTP.",
    INVALID_TOKEN: "Invalid OTP.",

    USER_DELETE_SUCCESS: " deteted sucessfully",
    UPDATE_DOCUMENT_SUCCESS: "Update sucessfully",
    UPDATE_STATUS_SUCCESS: "update status sucessfully",
    KYC_APPROVED: "KYC Approved sucessfully",
    KYC_REJECTED: "KYC Rejected sucessfully",
    KYC_ALREADY_REJECTED: "KYC Already Rejected",

    //Register API message 
    REGISTER_DEACTIVE_USER_MSG: "Your email is deactivated from admin. Please contanct to support.",
    REGISTER_SUCCESS_USER_MSG: "You are successfully registered. We have sent an email, please verify  your account.",
    REGISTER_FAILED_USER_MSG: "Registration failed.",
    REGISTER_ALREADY_EXIST_USER_MSG: "You email address already exist.",
    REGISTER_ALREADY_EXIST_USERNAME_MSG: "Your username is already exist.",
    REGISTER_SERVER_ERROR_MSG: "Sorry for inconvenience! Facing something wrong while processing your request.",

    //validateOtp API message 
    VALIDATE_OTP_LOGIN_SUCCESS_MSG: "You are successfully logged in.",
    VALIDATE_OTP_SERVER_ERROR_MSG: "Server Error.",
    VALIDATE_OTP_INVALID_OTP_OR_EXPIRED_MSG: "Invalid OTP or expired.",
    VALIDATE_ALREADY_VERY: "Already verified",

    //login API message
    LOGIN_DEACTIVE_USER_MSG: "Your email is deactivated from admin. Please contanct to support.",
    LOGIN_RESEND_VERIFICATION_LINK_MSG: "This email registered with us but not verified. Please resend verification link or contact to support.",
    LOGIN_SUCCESS_MSG: "Success",
    LOGIN_EMAIL_NOT_VERIFIED_MSG: "email is  not Verified.",
    LOGIN_ENTER_VALID_PASSWORD_MSG: "Enter valid password.",
    LOGIN_ENTER_VALID_EMAIL_MSG: "Please enter valid email.",
    LOGIN_ENTER_VALID_USERNAME_MSG: "Please enter valid userName.",
    LOGIN_FAILURE_MSG: "Sorry for inconvenience! Facing something wrong while processing your request.",

    //loginValidateOtp API message
    LOGIN_VALIDATE_OTP_MANUAL_SUCCESS_MSG: "This email used. Please try use new one or contact to admin.",
    LOGIN_VALIDATE_OTP_DEACTIVE_USER_MSG: "Your email is deactivated from admin. Please contanct to support.",
    LOGIN_VALIDATE_OTP_RESEND_VERIFICATION_LINK_MSG: "This email registered with us but not verified. Please resend verification link or contact to support.",
    LOGIN_VALIDATE_OTP_SUCCESS_MSG: "You are successfully logged in.",
    LOGIN_VALIDATE_OTP_INVALID_OTP_OR_EXPIRED_MSG: "Invalid OTP or expired.",
    LOGIN_VALIDATE_OTP_EMAIL_NOT_VERIFIED_MSG: "email is  not Verified",
    LOGIN_VALIDATE_OTP_VALID_PASSWORD_MSG: "Enter valid password.",
    LOGIN_VALIDATE_OTP_VALID_EMAIL_MSG: "Please enter valid email.",
    LOGIN_VALIDATE_OTP_FAILURE_MSG: "Sorry for inconvenience! Facing something wrong while processing your request.",

    //updatepassword API message
    UPDATE_PASSWORD_SUCESSFULLY_MSG: "Password updated successfully",
    UPDATE_PASSWORD_EMAIL_NOT_VERIFIED_MSG: "email is  not Verified.",
    UPDATE_PASSWORD_VALID_PASSWORD_MSG: "Enter valid password.",
    UPDATE_PASSWORD_VALID_EMAIL_MSG: "Please enter valid email.",
    UPDATE_PASSWORD_FAILURE_MSG: "Sorry for inconvenience! Facing something wrong while processing your request.",
    UPDATE_PASSWORD_MISMATCH_NEW_PASS: "Confirm password and new password should be same.",
    UPDATE_PASSWORD_MISMATCH_OLD_PASS: "Old password and new password should not be same.",

    //validateToken API message
    VALIDATE_TOKEN_NEWPASS_OR_CONFIRMPASS_NOT_MATCHED_MSG: "New password and confirm password not matched.",
    VALIDATE_TOKEN_UPDATE_PASSWORD_SUCCESS_MSG: "Your password is successfully updated.",
    VALIDATE_TOKEN_INVALID_TOKEN_MSG: "Invalid OTP.",
    VALIDATE_TOKEN_EMAIL_NOT_VERIFIED_MSG: "email is  not Verified.",
    VALIDATE_TOKEN_VALID_PASSWORD_MSG: "Enter valid password.",
    VALIDATE_TOKEN_VALID_EMAIL_MSG: "Please enter valid email.",
    VALIDATE_TOKEN_FAILURE_MSG: "Sorry for inconvenience! Facing something wrong while processing your request.",

    //forgotPassword API message
    FORGOT_PASSWORD_RESEND_VERIFICATION_LINK_MSG: "This email registered with us but not verified. Please resend verification link or contact to support.",
    FORGOT_PASSWORD_SUCCESS_MESSAGE_MSG: "Otp sent successfully to your email",
    FORGOT_PASSWORD_EMAIL_NOT_VERIFIED_MSG: "email is  not Verified.",
    FORGOT_PASSWORD_VALID_PASSWORD_MSG: "Enter valid password.",
    FORGOT_PASSWORD_VALID_EMAIL_MSG: "Please enter valid email.",
    FORGOT_PASSWORD_FAILURE_MSG: "Sorry for inconvenience! Facing something wrong while processing your request.",

    //forgotUpdatePassword API message
    FORGOT_UPDATE_PASSWORD_NEWPASS_OR_CONFIRMPASS_NOT_MATCHED_MSG: "New password and confirm password not matched.",
    FORGOT_UPDATE_PASSWORD_SUCCESS_MSG: "Your password is successfully updated.",
    FORGOT_UPDATE_PASSWORD_INVALID_OTP_MSG: "Invalid OTP.",
    FORGOT_UPDATE_PASSWORD_VALID_EMAIL_MSG: "Please enter valid email.",
    FORGOT_UPDATE_PASSWORD_INVALID_TOKEN_MSG: "Invalid OTP.",
    FORGOT_UPDATE_PASSWORD_FAILURE_MSG: "Sorry for inconvenience! Facing something wrong while processing your request.",

    //resendVerificationLink API message
    RESEND_VERIFICATION_LINK_EMAIL_ALREADY_VERIFIED_MSG: "This email already verified.",
    RESEND_VERIFICATION_LINK_SEND_LINK_RESET_PASS_MSG: "We have sent link to your email please check and reset your password.",
    RESEND_VERIFICATION_LINK_EMAIL_NOT_VERIFIED_MSG: "email is  not Verified.",
    RESEND_VERIFICATION_LINK_VALID_PASSWORD_MSG: "Enter valid password.",
    RESEND_VERIFICATION_LINK_VALID_EMAIL_MSG: "Please enter valid email.",
    RESEND_VERIFICATION_LINK_FAILURE_MSG: "Sorry for inconvenience! Facing something wrong while processing your request.",

    //sendContactMail API message
    SEND_CONTACT_MAIL_UPDATE_PASSWORD_SUCCESS: "Your password is successfully updated.",

    //webHookBtc API message
    WEB_HOOK_BTC_SUCCESS_MSG: "Success.",
    WEB_HOOK_BTC_OVERVIEW_FAILURE_MSG: "Error to OVERVIEW.",

    //webHookDicExch API message
    WEB_HOOK_DICEXCH_SUCCESS_MSG: "Success.",
    WEB_HOOK_DICEXCH_OVERVIEW_FAILURE_MSG: "Error to OVERVIEW.",

    //getProfile API message
    GET_PROFILE_DEACTIVE_USER_MSG: "Your email is deactivated from admin. Please contanct to support.",
    GET_PROFILE_RESEND_VERIFICATION_LINK_MSG: "This email registered with us but not verified. Please resend verification link or contact to support.",
    GET_PROFILE_SUCCESS_MSG: "Success.",
    GET_PROFILE_FAILED_MSG: "Sorry for inconvenience! Facing something wrong while processing your request.",

    //getTx API message
    GET_TX_SUCCESS_MSG: "Success.",
    GET_TX_FAILED_MSG: "Sorry for inconvenience! Facing something wrong while processing your request.",

    //createTicket API message
    CREATE_TICKET_SUCCESS_MSG: "Success.",
    CREATE_TICKET_ALREADY_EXIST_MSG: "ticket already exist",
    CREATE_TICKET_FAILURE: "Failed.",

    //swapAmount API message
    SWAP_AMOUNT_SUCCESS_MSG: "Success.",
    SWAP_AMOUNT_ISSUE_MAKE_TRANSACTION_MSG: "Issue to make transaction.",
    SWAP_AMOUNT_INSUFFICIENT_BALANCE_MSG: "Insufficient balance.",
    SWAP_AMOUNT_USER_WALLETDATA_NOT_MATCH_MSG: "userWalletData not matched.",
    SWAP_AMOUNT_PRICE_NOT_MATCH_MSG: "Price not matched.",
    SWAP_AMOUNT_INVALID_PAIR_MSG: "Invalid Pair",
    SWAP_AMOUNT_ENTER_VALID_PASSWORD_MSG: "Enter valid password.",
    SWAP_AMOUNT_SERVER_ERROR_MSG: "Server Error.",

    //sendCoin API message
    SEND_COIN_SUCCESS_MSG: "Success.",
    SEND_COIN_FAILURE_MSG: "Failed.",
    SEND_COIN_INSUFFICIENT_BALANCE_MSG: "Insufficient balance.",
    SEND_COIN_ENTER_VALID_ADDRESS_MSG: "Please send valid address.",
    SEND_COIN_USER_WALLETDATA_NOT_MATCH_MSG: "userWalletData not matched.",
    SEND_COIN_INVALID_PAIR_MSG: "Invalid Pair",
    SEND_COIN_ENTER_VALID_PASSWORD_MSG: "Enter valid password.",
    SEND_COIN_SERVER_ERROR_MSG: "Server Error.",
    SEND_COIN_ERROR_IN_TX: "Error to make transaction.",
    SEND_COIN_TX_APPROVED_BY_ADMIN: "Tx approve by admin",

    //createKYC API message
    CREATE_KYC_SUCCESS_MSG: "Success.",
    CREATE_KYC_ALREADY_EXIST_MSG: "KYC already exist.",
    CREATE_KYC_FAILURE_MSG: "Failed.",

    //getKYC API message
    GET_KYC_FAILURE_MSG: "Failed.",
    GET_KYC_ALREADY_EXIST_MSG: "already exist.",
    GET_KYC_NOT_FOUND_MSG: "Not found.",
    GET_KYC_SUCCESS_MSG: "Success.",


    KYC_DOC_LESS_THEN_THREE_MSG: "Kyc Doc List Less Than 3.",



    //createKYC API message
    PACKAGE_ALREADY_EXIST: "Package with this name already exist",
    MAINTENANCE_ALREADY_EXIST: "Maintenance with this name already exist",
    APPSETTING_ALREADY_EXIST: "App Setting with this name already exist",

    //createKYC API message
    CREATE_STAKE_SUCCESS_MSG: "Success.",
    CREATE_STAKE_ALREADY_EXIST_MSG: "STAKE already exist.",
    CREATE_STAKE_FAILURE_MSG: "Failed.",

    CREATE_COIN_SUCESSFULLY_MSG: "Coin Created successfully.",
    UPDATE_COIN_SUCESSFULLY_MSG: "Coin updated successfully.",
    COIN_ALREADY_EXIST: "Coin Already Exist.",
    COIN_DELETE_SUCCESS: "Coin Deleted Successfully",

    UPDATE_COIN_INDEX_SUCESSFULLY_MSG: "Coin Index updated successfully.",
    COIN_INDEX_ALREADY_EXIST: "Coin Id is Already Exist in This Collection.",
    COIN_INDEX_DELETE_SUCCESS: "Coin Index Deleted Successfully",
    COIN_INDEX_CREATE_SUCCESS: "Coin Index Created Successfully",

    INDEX_UPDATE_SUCESSFULLY: "Index updated successfully.",
    INDEX_ALREADY_EXIST: "Index Already Exist.",
    INDEX_DELETE_SUCCESS: "Index Deleted Successfully",
    INDEX_CREATE_SUCCESS: "Index Created Successfully",

    DOCUMENT_DELETE_SUCCESS: "Document Deleted Successfully",


    USER_INFO_SAVED_MSG: "Saved User Info.",
    USER_INFO_FAILURE_MSG: "Failed.",
    SOCIAL_INFO_FAILURE_MSG: "Failed.",

    REGISTER_SUCCESS: "Register Successfully",
    INVALID_REF_CODE: "Invalid referral code",


    CREATE_STATE_SUCESSFULLY_MSG: "State Created successfully.",
    UPDATE_STATE_SUCESSFULLY_MSG: "State updated successfully.",
    STATE_ALREADY_EXIST: "State Already Exist.",
    STATE_DELETE_SUCCESS: "State Deleted Successfully",

    CREATE_CITY_SUCESSFULLY_MSG: "City Created successfully.",
    UPDATE_CITY_SUCESSFULLY_MSG: "City updated successfully.",
    CITY_ALREADY_EXIST: "City Already Exist.",
    CITY_DELETE_SUCCESS: "City Deleted Successfully",



    CREATE_COUNTRY_SUCESSFULLY_MSG: "Country Created successfully.",
    UPDATE_COUNTRY_SUCESSFULLY_MSG: "Country updated successfully.",
    COUNTRY_ALREADY_EXIST: "Country Already Exist.",
    COUNTRY_DELETE_SUCCESS: "Country Deleted Successfully",

    VALIDATE_LOGIN_OTP: "We have sent an email, please verify your account.",

    UPDATE_PASS_OTP: "We have sent an email, please verify your account.",

    INSUFFICIENT_AMOUNT: "Insufficient amount!",

    CREATE_MAKE_PAYMENT_SUCESSFULLY_MSG: "Payment Created successfully.",
    UPDATE_MAKE_PAYMENT_SUCESSFULLY_MSG: "Payment updated successfully.",
    MAKE_PAYMENT_ALREADY_EXIST: "Payment Already Exist.",
    MAKE_PAYMENT_DELETE_SUCCESS: "Payment Deleted Successfully",


    PAYMENT_APPROVED: "Payment Approved sucessfully",
    PAYMENT_REJECTED: "Payment Rejected sucessfully",


    AADHAAR_KYC_ALREADY_REJECTED: "This Aadhaar Card No. is already associated with another account",
    PAN_KYC_ALREADY_REJECTED: "This Pan Card No. is already associated with another account",



    CREATE_LTArchiveReward_SUCESSFULLY_MSG: "Create Successfully",
    LTArchiveReward_ALREADY_EXIST: "This Rank Is Already Exist ",
    UPDATE_LTArchiveReward_SUCESSFULLY_MSG: "Update Successfully",
    LTArchiveReward_DELETE_SUCCESS: "Delete Successfully",

    INVALID_USERNAME: "Invalid UserName !",
    VERIFIED_USERNAME: "Verified UserName.",

    UPDATE_SUCESSFULLY_MSG: "Update Successfully",

    USERNAME_UPDATE_SUCESSFULLY_MSG: "UserName Update Successfully",
    USERNAME_ALREADY_EXIST: "UserName Already Exist.",


    USER_PROMO_PACKAGE_ALREADY_EXIST: " already exist",

    UPDATE_PASSWORD_SUCESSFULLY_MSG: "Password updated successfully",
    UPDATE_PASSWORD_MISMATCH_NEW_PASS: "Confirm password and new password should be same.",
    UPDATE_PASSWORD_MISMATCH_OLD_PASS: "Old password and new password should not be same.",
    UPDATE_PASSWORD_EMAIL_NOT_VERIFIED_MSG: "email is  not Verified.",
    UPDATE_PASSWORD_VALID_PASSWORD_MSG: "Enter valid password.",
    UPDATE_PASSWORD_VALID_EMAIL_MSG: "Please enter valid email.",
    UPDATE_PASSWORD_FAILURE_MSG: "Sorry for inconvenience! Facing something wrong while processing your request.",


    EMAIL_UPDATE_SUCESSFULLY_MSG: "Email Update Successfully",
    EMAIL_ALREADY_EXIST: "Email Already Exist.",

    USER_NOT_FOUND: "User Not found.",



    UPDATE_EMAIL_SUCESSFULLY_MSG: "Email Updated Successfully",
    UPDATE_USERNAME_MISMATCH_NEW_PASS: "Confirm Username and New Username should be same.",
    UPDATE_USERNAME_MISMATCH_OLD_PASS: "Old Username and New Username should not be same.",
    ENTER_VALID_EMAIL_CURR: "Please Enter Valid Current Email.",

    ENTER_VALID_PASSWORD_CURR: "Please Enter Valid Current Password.",
    DATA_NULL: "Data null"


});

