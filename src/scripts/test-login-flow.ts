import axios from "axios";

async function testLoginFlow() {
  try {
    console.log("Testing login API flow...\n");

    const credentials = {
      email: "riya@example.com",
      password: "secure"
    };

    console.log(`📤 Sending POST to http://localhost:5080/api/v1/auth/login`);
    console.log(`   Credentials:`, credentials);
    console.log();

    const response = await axios.post(
      "http://localhost:5080/api/v1/auth/login",
      credentials,
      {
        headers: { "Content-Type": "application/json" },
        validateStatus: () => true // Don't throw on any status
      }
    );

    console.log(`📥 Response received:`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Data:`, JSON.stringify(response.data, null, 2));
    console.log();

    if (response.status === 200 && response.data.success) {
      console.log("✅ Login successful!");
      console.log(`   User ID: ${response.data.data.id}`);
      console.log(`   Email: ${response.data.data.email}`);
      console.log(`   Name: ${response.data.data.firstName} ${response.data.data.lastName}`);
      console.log(`   Role: ${response.data.data.role}`);
      console.log(`   Access Token: ${response.data.data.accessToken?.substring(0, 20)}...`);
    } else {
      console.log("❌ Login failed!");
      console.log(`   Message: ${response.data.message}`);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("❌ Axios Error:");
      console.error(`   Message: ${error.message}`);
      console.error(`   Response:`, error.response?.data);
    } else {
      console.error("❌ Error:", error);
    }
  }
}

testLoginFlow();
