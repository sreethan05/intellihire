# pgAdmin Database Setup Guide

Follow these steps to import the IntelliHire unified schema and seed data into pgAdmin.

## Step 1: Create the Database in pgAdmin
1. Open **pgAdmin** and connect to your server.
2. Right-click on **Databases** ➡️ **Create** ➡️ **Database...**.
3. Set the Database Name (e.g., `intellihire`) and click **Save**.

## Step 2: Open the Query Tool
1. Select your new database (`intellihire`) in the object tree.
2. Click on **Tools** in the top menu and select **Query Tool**.

## Step 3: Run the Schema Script
1. Click the **Open File** icon (folder icon) in the Query Tool toolbar.
2. Select the unified schema file: [schema.sql](file:///c:/Users/USER/OneDrive/Desktop/intellihire/database/schema.sql).
3. Click the **Execute** button (play icon or press `F5`).
4. You should see a message: *“Query returned successfully.”*

## Step 4: Run the Question Bank Seed File
1. Open a new Query Tool tab.
2. Click the **Open File** icon.
3. Select the seed data file: `database/seed-question-bank.sql`.
4. Click the **Execute** button (`F5`).
5. This file contains default question banks and can take 5–10 seconds to complete.

---

*Note: Your application is configured to run these migrations automatically on startup using `npm run migrate`, but importing them manually via pgAdmin works exactly the same.*
