const mongoose = require("mongoose");

const FancyManagerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },         // e.g. "Boundaries", "Fall of Wicket", "Runs"
    keywords: [{ type: String, trim: true }],                    // keywords to match from socket data e.g. ["BOUNDARY", "BOUNDARIES", "4S"]
    status: { type: Boolean, default: true },                    // show or hide this fancy type
    maxBet: { type: Number, default: 50000 },                    // max bet amount allowed
    betDelay: { type: Number, default: 0, min: 0, max: 10 },      // delay in seconds (0-10)
    commission: { type: Boolean, default: false },               // commission on/off
    category: { type: String, default: "normal", enum: ["normal", "extra", "cricketCasino", "oddEven"] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "staff" },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

FancyManagerSchema.index({ name: 1 });
FancyManagerSchema.index({ status: 1 });
FancyManagerSchema.index({ category: 1 });
FancyManagerSchema.index({ isDeleted: 1 });

module.exports = mongoose.model("fancymanager", FancyManagerSchema);
