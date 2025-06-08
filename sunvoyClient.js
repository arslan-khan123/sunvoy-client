const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs").promises;
const crypto = require("crypto");

// Get fresh nonce and cookies
async function getFreshNounceAndCookies() {
  console.log("Getting fresh nonce...");

  try {
    const response = await axios.get("https://challenge.sunvoy.com/login");
    const cookies = response.headers["set-cookie"]?.join("; ") || "";
    const $ = cheerio.load(response.data);
    const nonce = $('input[name="nonce"]').val();

    if (!nonce) throw new Error("Could not extract nonce");

    console.log("Fresh nonce and cookies obtained");
    return { nonce, cookies };
  } catch (error) {
    console.error("Error getting nonce and cookies:", error.message);
    throw error;
  }
}

// Authenticate and get session cookies
async function authenticate() {
  console.log("Authenticating...");

  try {
    const { nonce, cookies } = await getFreshNounceAndCookies();

    const loginData = `nonce=${nonce}&username=demo%40example.org&password=test`;

    const response = await axios.post(
      "https://challenge.sunvoy.com/login",
      loginData,
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: cookies,
        },
        maxRedirects: 0, // Prevent automatic following of redirects
      }
    );
  } catch (error) {
    // Handle redirect as success
    if (error.response?.status === 302) {
      const sessionCookies = error.response.headers["set-cookie"]?.join("; ") || "";
      console.log(" Authentication successful");
      console.log(`Session cookies obtained: ${sessionCookies}`);
      return sessionCookies;
    }
    console.error("Authentication failed:", error.message);
    throw error;
  }
}

// Fetch users data
async function fetchUsers(cookies) {
  console.log("Fetching users...");

  try {
    const response = await axios.post(
      "https://challenge.sunvoy.com/api/users",
      "",
      {
        headers: { cookie: cookies },
      }
    );

    console.log("Users fetched");
    return response.data;
  } catch (error) {
    console.error("Error fetching users:", error.message);
    throw error;
  }
}

// Fetch tokens dynamically
async function fetchTokens(cookies) {
  console.log("Fetching API tokens...");

  try {
    const response = await axios.get(
      "https://challenge.sunvoy.com/settings/tokens",
      {
        headers: {
          cookie: cookies,
          accept: "*/*",
          "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        },
      }
    );

    const $ = cheerio.load(response.data);

    // Extract tokens from hidden inputs
    const tokens = {
      access_token: $("#access_token").val(),
      openId: $("#openId").val(),
      userId: $("#userId").val(),
      apiuser: $("#apiuser").val(),
      operateId: $("#operateId").val(),
      language: $("#language").val(),
    };

    console.log("API tokens fetched successfully");
    return tokens;
  } catch (error) {
    console.error("Error fetching tokens:", error.message);
    throw error;
  }
}

/* Generate checkcode (approximation using SHA-1 hash) which is not gonna work
 as i don't know the logic on the backend that how [checkcode] is getting created 
 and on which entities it is dependent on (i.e as far as i observed it is mainly dependent
 on access token and timestamp) */

function generateCheckcode(tokens, timestamp) {
  const dataToHash = `${tokens.access_token}${tokens.apiuser}${tokens.language}${tokens.openId}${tokens.operateId}${timestamp}${tokens.userId}`;
  return crypto
    .createHash("sha1")
    .update(dataToHash)
    .digest("hex")
    .toUpperCase();
}

// Fetch current user settings with dynamic tokens
async function fetchSettings(cookies) {
  console.log("Fetching settings...");

  try {
    // First get the dynamic tokens
    const tokens = await fetchTokens(cookies);

    // Generate current timestamp
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Generate checkcode
    const checkcode = generateCheckcode(tokens, timestamp);

    const settingsData = new URLSearchParams({
      access_token: tokens.access_token,
      apiuser: tokens.apiuser,
      language: tokens.language,
      openId: tokens.openId,
      operateId: tokens.operateId,
      timestamp: timestamp,
      userId: tokens.userId,
      checkcode: checkcode,
    });

    console.log("Using dynamic settings payload:", {
      access_token: tokens.access_token,
      apiuser: tokens.apiuser,
      timestamp: timestamp,
      userId: tokens.userId,
      checkcode: checkcode,
    });

    const response = await axios.post(
      "https://api.challenge.sunvoy.com/api/settings",
      settingsData,
      {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: cookies,
        },
      }
    );

    console.log("Settings fetched with dynamic tokens");
    return response.data;
  } catch (error) {
    console.error("Error fetching settings:", error.message);
    console.error("Error details:", error.response?.data);
    throw error;
  }
}

/**
 * Save combined data to JSON file
 */
async function saveToFile(usersData, settingsData) {
  console.log("Saving data to users.json...");

  const combinedData = {
    timestamp: new Date().toISOString(),
    users: [...usersData, settingsData], // Combine 9 users and authenticated user
    metadata: {
      totalUsers: 10, // Expecting 9 users + 1 authenticated user
      fetchedAt: new Date().toLocaleString(),
      apiEndpoints: [
        "https://challenge.sunvoy.com/api/users",
        "https://api.challenge.sunvoy.com/api/settings",
        "https://challenge.sunvoy.com/settings/tokens"
      ],
    },
  };

  try {
    await fs.writeFile("users.json", JSON.stringify(combinedData, null, 2));
    console.log("Data saved successfully to users.json");
  } catch (error) {
    console.error(" Error saving file:", error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    const cookies = await authenticate();
    const users = await fetchUsers(cookies);
    const settings = await fetchSettings(cookies);
    await saveToFile(users, settings);
    console.log("10 users saved to users.json");
  } catch (error) {
    console.error("Main process failed:", error.message);
  }
}

main();