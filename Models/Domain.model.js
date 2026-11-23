const mongoose = require("mongoose");

const DomainSchema = new mongoose.Schema(
  {
    domainName: {
      type: String,
      required: false,
    },
    domainUrl: {
      type: String,
      required: false,
    },
    userNotification: {
      type: String,
      required: false,
    },
    clientNotification: {
      type: String,
      required: false,
    },
    logo: {
      type: String,
      required: false,
    },
    favicon: {
      type: String,
      required: false,
    },
    title: {
      type: String,
      required: false,
    },
    operatorId: {
      type: String,
      required: false,
    },
    imgBaseUrl: {
      type: String,
      required: false,
    },
    whatsappNumber: {
      type: Number,
      required: false,
    },
    helplineNumber: {
      type: Number,
      required: false,
    },
    assignSubownerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    assignAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    status: {
      type: Boolean,
      default: true,
    },
    registerBonus: {
      type: Boolean,
      default: true, // by default on first deposit its true
    },
    onEveryDeposit: {
      type: Boolean,
      default: false,
    },
    isRegister: {
      type: Boolean,
      default: false,
    },
    isAffilation: {
      type: Boolean,
      default: false,
    },
    isReferral: {
      type: Boolean,
      default: false,
    },
    talkTo: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isSignupBonus: {
      type: Boolean,
      default: false,
    },
    maximumWithdrawAmount: {
      type: Number,
      default: 1000000,
    },
    minimumWithdrawAmount: {
      type: Number,
      default: 100,
    },
    themeSetting: {},
    sportsSetting: {},
    apiKey: {},
    banner: {},
    socialMedia: {},
    barcode: {},
    upi: {},
    account: {},
    isSignUpOtp: {
      type: Boolean,
      default: true,
    },
    reffrelSetting: {},
    bonusSetting: {},
    signUpBonusSetting: {},
    isTransactionPassword: { type: Boolean, default: false },
    isReferralBonus: { type: Boolean, default: false },
    aboutUs: { type: String, default: "" },
    contactUs: { type: String, default: "" },
    isCashOut: { type: String, required: false },
    color: {},
    // SEO & Meta
    metaTitle: { type: String, default: "" },
    metaDescription: { type: String, default: "" },
    metaKeywords: { type: String, default: "" },
    googleAnalyticsId: { type: String, default: "" },
    facebookPixelId: { type: String, default: "" },
    googleTagManagerId: { type: String, default: "" },
    canonicalUrl: { type: String, default: "" },
    // Open Graph
    ogTitle: { type: String, default: "" },
    ogDescription: { type: String, default: "" },
    ogImage: { type: String, default: "" },
    ogType: { type: String, default: "website" },
    // Indexing
    allowIndexing: { type: Boolean, default: true },
    allowCrawling: { type: Boolean, default: true },
    showInSearch: { type: Boolean, default: true },
    enableSitemap: { type: Boolean, default: false },
    // Content Pages
    termsAndConditions: { type: String, default: "" },
    privacyPolicy: { type: String, default: "" },
    responsibleGambling: { type: String, default: "" },
    faq: { type: String, default: "" },
    rules: { type: String, default: "" },
    refundPolicy: { type: String, default: "" },
    kycPolicy: { type: String, default: "" },
    amlPolicy: { type: String, default: "" },
    bonusTerms: { type: String, default: "" },
    disclaimer: { type: String, default: "" },
    // Subagent panel fields (Mixed objects)
    depositSetting: {},
    clientRestrictions: {},
    maintenance: {},
    seoMeta: {},
    contentPages: {},
    popupSetting: {},
    codeSetting: {},
    tvSetting: {},
    scoreSetting: {},
    
  },
  {
    timestamps: true,
  }
);

const DomainModel = mongoose.model("domain", DomainSchema);

module.exports = DomainModel;
