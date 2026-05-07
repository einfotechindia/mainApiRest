let nodemailer = require('nodemailer');
let htmltemplate = require('./htmltemplate');
let settings = require('../config/settings.json');

let transporter = nodemailer.createTransport({
    host: settings.SMTP_HOST,
    port: settings.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: settings.SMTP_USERNAME, // generated ethereal user
        pass: settings.SMTP_PASSWORD // generated ethereal password
    },
    tls: {
        rejectUnauthorized: false
    }
});


const sendVerificationEmail = async (email, link) => {
    console.log("sendVerificationEmail_____email_____::", email);
   
    try {

        return await transporter.sendMail({
            from: settings.SMTP_EMAIL,
            to: email,
            subject: 'Verify email address, Efincap wallet.',
            html: (await htmltemplate.verificationEmail(link)).toString()
        });
    } catch (error) {
        console.log("email error ::: ", error);

    }

}

const resetPassword = async (email, link) => {
    try {
        return await transporter.sendMail({
            from: settings.SMTP_EMAIL,
            to: email,
            subject: 'Reset password, Efincap wallet.',
            html: (await htmltemplate.resetPassword(link)).toString()
        });
    } catch (error) {
        console.log("email error ::: ", error);

    }

}

const otpSend = async (email, otp) => {
    try {

        //console.log((await htmlTemplateTemp).toString());

        return await transporter.sendMail({
            from: settings.SMTP_EMAIL,
            to: email,
            subject: 'Otp for login, Efincap wallet.',
            html: (await htmltemplate.otpSend(otp)).toString()
        });
    } catch (error) {
        console.log("email error ::: ", error);

    }

}
const otpSendTX = async (email, otp) => {
    try {
        return await transporter.sendMail({
            from: settings.SMTP_EMAIL,
            to: email,
            subject: 'Otp for transaction, Efincap wallet.',
            html: (await htmltemplate.otpSendTX(otp)).toString()
        });
    } catch (error) {
        console.log("email error ::: ", error);

    }

}






const sendRegisterSucessMessage = async (email, link) => {
    // console.log("sendRegisterSucessMessage_____email_____::", email);
    try {

        return await transporter.sendMail({
            from: settings.SMTP_EMAIL,
            to: email,
            subject: 'Register Success Message, Welcome to Efincap.',
            html: (await htmltemplate.registerSucessMessage(link)).toString()
        });
    } catch (error) {
        console.log("email error ::: ", error);

    }

}
module.exports = {
    sendVerificationEmail, resetPassword, otpSend, otpSendTX,sendRegisterSucessMessage
};