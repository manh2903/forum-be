const admin = require("firebase-admin");
const logger = require("../utils/logger");
const path = require("path");

// Sử dụng file JSON service account
const serviceAccountPath = path.join(__dirname, "../..", "serviceAccountKey.json");

try {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
  });
  logger.info("Firebase Admin initialized via service account file");
} catch (error) {
  logger.error("Error initializing Firebase Admin:", error);
}

const sendFCMNotification = async (token, payload) => {
  if (!admin.apps.length || !token) return;

  try {
    const message = {
      token: token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "high_priority",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    logger.info("Successfully sent FCM message:", response);
    return response;
  } catch (error) {
    logger.error("Error sending FCM message:", error);
    // Nếu token hết hạn, nên xóa khỏi database ở bước tiếp theo
    if (error.code === "messaging/registration-token-not-registered") {
      return { error: "unregistered" };
    }
    throw error;
  }
};

module.exports = { admin, sendFCMNotification };
