const axios = require("axios");
const cron = require("node-cron");
const logger = require("./utils/logger");
const nodemailer = require("nodemailer");

// We are currently running 3 cron jobs-
// 1) To sync aita calendar data every day at midnight
// 2) To sync acceptance list of upcoming matches every 1 hour
// 3) To sync AITA ranks data by checking if new PDF is available (4 times a day at 12 AM, 6 AM, 12 PM, 6 PM)

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: parseInt(process.env.MAIL_PORT),
  secure: process.env.MAIL_ENCRYPTION === "ssl", // true for 465
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
  },
});

const sendMail = async (subject, text) => {
  try {
    await transporter.sendMail({
      from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_ADDRESS}>`,
      to: "a.mathur@internetbusinesssolutionsindia.com, naveen@internetbusinesssolutionsindia.com",
      subject,
      text,
    });
    console.log("Email sent successful");
    logger.info("Email sent successful");
  } catch (error) {
    console.log("Failed to send email:", error);
    logger.error("Failed to send email:", error);
  }
};

function getQueryParams(url) {
  const params = {};
  const queryString = url.split("?")[1];
  if (!queryString) return params;

  const pairs = queryString.split("&");
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    params[decodeURIComponent(key)] = decodeURIComponent(value || "");
  }

  return params;
}

// Job 1 - Sync calendar data every day at midnight
cron.schedule("0 0 0 * * *", async () => {
  try {
    const resp = await axios.get("https://control.tenniskhelo.com/api/save-aita-calender-data");
    logger.info(`Successfully hit calendar sync data URL`);
  } catch (error) {
    logger.error("❌ Error in acceptance list cron job", {
      message: error.message,
      stack: error.stack,
    });
  }
});

// Job 2 - Sync acceptance list of upcoming matches every 1 hour
cron.schedule("0 0 */1 * * *", async () => {
  try {
    const resp = await axios.get("https://control.tenniskhelo.com/api/aita-calender-upcoming-matches");

    const data = resp?.data?.data || [];

    if (data.length === 0) {
      console.log("No upcoming matches found.");
      return;
    }

    for (const match of data) {
      const url = `https://control.tenniskhelo.com/api/save-aita-acceptance-list/${match.tournament_id}`;
      try {
        const response = await axios.get(url);
        logger.info(`Success for tournament_id ${match.tournament_id}`,response.data);
      } catch (err) {
        logger.error(`❌ Failed for tournament_id ${match.tournament_id}`, err.response?.status, err.message);
      }
    }
  } catch (error) {
    logger.error("❌ Error in acceptance list cron job", {
      message: error.message,
      stack: error.stack,
    });
  }
});

const isValidUrl = async (url) => {
  try {
    const response = await axios.head(url);
    return response.status === 200;
  } catch (err) {
    return false;
  }
};

// Job 3 - Sync AITA ranks data by checking if new PDF is available (4 times a day at 12 AM, 6 AM, 12 PM, 6 PM)
cron.schedule("0 0 0,6,12,18 * * *", async () => {
  try {
    // 1️⃣ Fetch last sync date
    const response = await axios.get(
      "https://control.tenniskhelo.com/api/last-aita-ranks-sync-date",
    );

    const lastSyncDateStr = response?.data?.last_sync_date;
    // const lastSyncDateStr = "2026-01-15";
    if (!lastSyncDateStr) {
      console.log("❌ last_sync_date not received");
      return;
    }

    // console.log("Last sync date:", lastSyncDateStr);

    // 2️⃣ Prepare dates
    const lastSyncDate = new Date(lastSyncDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 🚫 Skip lastSyncDate itself → start from next day
    let currentDate = new Date(lastSyncDate);
    currentDate.setDate(currentDate.getDate() + 1);

    // 3️⃣ Loop till today (included)
    while (currentDate <= today) {
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, "0");
      const dd = String(currentDate.getDate()).padStart(2, "0");

      // ✅ Date format strictly YYYY-MM-DD
      const formattedDate = `${yyyy}-${mm}-${dd}`;

      const url = `https://aitatennis.com/management/upload/ranking/${formattedDate}_BU-12.pdf`;

      // console.log(`🔍 Checking URL: ${url}`);

      const isValid = await isValidUrl(url);

      if (isValid) {
        console.log(`✅ PDF exists for ${formattedDate}`);

        try {
          const postRes = await axios.get(
            `https://control.tenniskhelo.com/api/aita-sync-ranks-via-job?date=${formattedDate}`,
            { timeout: 15000 },
          );

          logger.info(
            `🚀 Job triggered for ${formattedDate} | Status: ${postRes.status}`,
          );
        } catch (postError) {
          if (postError.response) {
            logger.error(`❌ GET failed for ${formattedDate}`, {
              status: postError.response.status,
              data: postError.response.data,
              headers: postError.response.headers,
            });
          } else if (postError.request) {
            logger.error(
              `❌ GET no response for ${formattedDate}`,
              postError.message,
            );
          } else {
            logger.error(
              `❌ GET setup error for ${formattedDate}`,
              postError.message,
            );
          }
        }
      } else {
        // logger.info(`⏭️ No PDF for ${formattedDate}`);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  } catch (error) {
    // console.log("❌ Error in cron job:", error.message);
    logger.error(`❌ AITA cron failed: ${error.message}`);
  }
});