const mongoose = require("mongoose");

const StaffActivitySchema = new mongoose.Schema(
  {
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    staffName: {
      type: String,
      required: true,
    },
    staffUsername: {
      type: String,
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      // auth: login, logout, login_failed
      // staff: create_staff, update_staff, delete_staff, status_change_staff
      // designation: create_designation, update_designation, delete_designation
      // permission: update_permissions, update_designation_permissions
      // page: add_page, update_page, delete_page
      // casino: declare_result, redeclare_result, edit_casino, etc.
      // match: match_edit, fancy_decision, rollback_fancy
      // settings: flush_redis, force_logout, password_reset, exposure_update, distribute_bonus
      // website: edit_website, update_notification
      // matka: create_matka, edit_matka, declare_matka_result
      // general: any other tracked action
    },
    category: {
      type: String,
      enum: [
        "auth",
        "staff_management",
        "designation",
        "permission",
        "page_management",
        "diamond_casino",
        "int_casino",
        "match",
        "matka",
        "settings",
        "website",
        "general",
      ],
      default: "general",
    },
    description: {
      type: String,
      required: true,
    },
    targetUser: {
      type: String,
      default: null,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    // Geo-location for login events
    city: { type: String, default: null },
    country: { type: String, default: null },
    state: { type: String, default: null },
    isp: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
      },
    },
  }
);

// Indexes for fast queries
StaffActivitySchema.index({ ownerId: 1, createdAt: -1 });
StaffActivitySchema.index({ staffId: 1, createdAt: -1 });
StaffActivitySchema.index({ category: 1, createdAt: -1 });
StaffActivitySchema.index({ action: 1, createdAt: -1 });

const StaffActivityModel = mongoose.model("StaffActivity", StaffActivitySchema);

module.exports = StaffActivityModel;
