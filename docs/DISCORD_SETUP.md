# Discord Activity Setup Guide

This guide walks you through setting up the D&D 5e Character Creator as a Discord Activity.

## Prerequisites

- Discord account with Developer access
- Node.js 18+ installed
- ngrok or similar tunneling tool for local development

## Step 1: Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name it "D&D 5e Character Creator" (or your preferred name)
4. Note down the **Application ID** (Client ID)

## Step 2: Configure Activity

1. In your Discord application, go to "Activities" tab
2. Click "Create Activity"
3. Fill in the details:
   - **Name**: D&D 5e Character Creator
   - **Description**: Create and manage D&D 5e characters with your party
   - **Tags**: game, roleplay, creative
4. Under "Activity Details":
   - **Target URL**: `https://your-ngrok-url.ngrok.io` (see Step 4)
   - **Supported Platforms**: Desktop, Mobile
   - **Orientation**: Unlocked

## Step 3: Environment Configuration

1. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Discord Client ID:
   ```env
   VITE_DISCORD_CLIENT_ID=your_actual_client_id_here
   VITE_API_HOST=http://localhost:8080
   VITE_SHOW_DEBUG=true
   ```

## Step 4: Local Development with ngrok

1. Install ngrok: https://ngrok.com/download
2. Start your development server:
   ```bash
   npm run dev
   ```
3. In another terminal, create a tunnel:
   ```bash
   ngrok http 3000
   ```
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
5. Update your Discord Activity's Target URL with this ngrok URL

## Step 5: Test the Activity

1. In Discord, join a voice channel
2. Click the "Activities" button (rocket icon)
3. Select "Developer Activities" or search for your app name
4. Launch the activity

## Debugging

### Debug Panel

The app includes a debug panel that shows:

- Discord environment detection
- Authentication status
- User information
- Participants list
- Raw environment data

### Common Issues

**"Discord SDK not initialized"**

- Check that `VITE_DISCORD_CLIENT_ID` is set correctly
- Ensure you're accessing the app through Discord (not directly in browser)

**"Authentication failed"**

- Verify your Client ID matches the Discord application
- Check that the Activity is properly configured in Discord Developer Portal

**"Frame not loading"**

- Ensure ngrok URL is HTTPS (not HTTP)
- Check that your development server is running on the correct port
- Verify the Target URL in Discord matches your ngrok URL exactly

### Development Tips

1. **Keep ngrok running**: The URL changes each time you restart ngrok (unless you have a paid account)
2. **Use Discord Web/Desktop**: Mobile testing can be done later
3. **Check browser console**: Discord SDK errors appear in the browser console
4. **Test with friends**: Activities are more fun (and better tested) with multiple participants

## Production Deployment

For production, you'll need:

1. A proper domain (not ngrok)
2. HTTPS certificate
3. Updated Target URL in Discord Developer Portal
4. Environment variables configured on your hosting platform

## Resources

- [Discord Embedded App SDK Documentation](https://discord.com/developers/docs/activities/overview)
- [Discord Activities Examples](https://github.com/discord/embedded-app-sdk)
- [ngrok Documentation](https://ngrok.com/docs)
