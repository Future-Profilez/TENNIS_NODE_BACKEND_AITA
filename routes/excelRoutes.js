const express = require("express");
const { MergeSheets } = require("../controllers/excelController");
const uploadExcel = require("../middlewares/excelUpload");

const router = express.Router();

router.post("/excel/merge", uploadExcel.array("files"), MergeSheets);


module.exports = router;