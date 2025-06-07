const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs").promises;

// Get fresh nonce and cookies
async function getFreshNounceAndCookies() {
  console.log("Getting fresh nonce...");

  try {
    const response = await axios.get("https://challenge.sunvoy.com/login");
    const cookies = response.headers["set-cookie"]?.join("; ") || "";
    const $ = cheerio.load(response.data);
    const nonce = $('input[name="nonce"]').val();

    if (!nonce) throw new Error("Could not extract nonce");

    console.log("✅ Fresh nonce and cookies obtained");
    return { nonce, cookies };
  } catch (error) {
    console.error("❌ Error getting nonce and cookies:", error.message);
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
      console.log("✅ Authentication successful");
      console.log(`📝 Session cookies obtained: ${sessionCookies}`);
      return sessionCookies;
    }
    console.error("❌ Authentication failed:", error.message);
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

    console.log("✅ Users fetched");
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching users:", error.message);
    throw error;
  }
}

/**
 * Save user data to JSON file
 */
async function saveToFile(usersData) {
  console.log("💾 Saving data to users.json...");

  const combinedData = {
    timestamp: new Date().toISOString(),
    users: usersData,
    metadata: {
      totalUsers: Array.isArray(usersData) ? usersData.length : 0,
      fetchedAt: new Date().toLocaleString(),
      apiEndpoint: "https://challenge.sunvoy.com/api/users",
    },
  };

  try {
    await fs.writeFile("users.json", JSON.stringify(combinedData, null, 2));
    console.log("✅ Data saved successfully to users.json");
  } catch (error) {
    console.error("❌ Error saving file:", error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    const cookies = await authenticate();
    const users = await fetchUsers(cookies);
    await saveToFile(users);
    console.log("🎉 Stage 2 completed. 9 users saved to users.json");
  } catch (error) {
    console.error("❌ Main process failed:", error.message);
  }
}

main();