const catchAsync = require("../utils/catchAsync");
const { successResponse, errorResponse } = require("../utils/ErrorHandling");
const XLSX = require("xlsx");

exports.MergeSheets = catchAsync(async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return errorResponse(res, "No Excel files uploaded", 400);
    }

    let mergedData = [];

    for (const file of req.files) {
      const workbook = XLSX.read(file.buffer, { type: "buffer" });

      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];

        const sheetData = XLSX.utils.sheet_to_json(sheet, {
          range: 2,
          header: ["Id", "Number", "Name", "Admin"],
          defval: null,
        });

        mergedData.push(...sheetData);
      });
    }

    // ✅ Deduplicate by Number
    const seenNumbers = new Set();
    const finalData = mergedData.filter((item) => {
      if (!item.Number) return false;

      if (seenNumbers.has(item.Number)) return false;

      seenNumbers.add(item.Number);
      return true;
    });

    return successResponse(res, "Excel sheets merged successfully", 200, {
      totalBeforeDedup: mergedData.length,
      totalAfterDedup: finalData.length,
      data: finalData,
    });
  } catch (error) {
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});