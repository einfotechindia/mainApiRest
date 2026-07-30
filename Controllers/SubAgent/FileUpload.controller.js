const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { SendResponse } = require("../../Helpers/ResponseMapper");

const imgFolder = path.join(__dirname, "../../public/Img");
if (!fs.existsSync(imgFolder)) fs.mkdirSync(imgFolder, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imgFolder),
  filename: (req, file, cb) => {
    const name = Date.now() + "_" + Math.random().toString(36).slice(2, 8) + path.extname(file.originalname);
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg|ico/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype.split("/")[1]);
    if (ext || mime) cb(null, true);
    else cb(new Error("Only image files allowed"));
  },
});

const handleUpload = async (req, res) => {
  try {
    if (!req.file) return SendResponse(res, "error", "No file uploaded. Send image as form-data with key 'image'");
    const imageUrl = `/Img/${req.file.filename}`;
    return SendResponse(res, "success", "File uploaded", { imageName: req.file.filename, imageUrl });
  } catch (err) {
    return SendResponse(res, "error", err.message || "Upload failed");
  }
};

module.exports = { upload, handleUpload };
