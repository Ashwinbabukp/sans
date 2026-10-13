# Authentication setup

The prototype uses Firebase Authentication's REST API for email/password accounts and Google Identity Services for Google/Gmail sign-in. No demo account or simulated successful login is included.

1. In Firebase Console, create or select a web project.
2. In **Authentication > Sign-in method**, enable **Email/Password** and **Google**.
3. In **Authentication > Settings > Authorized domains**, add `localhost` for local development and add the production host before deployment.
4. In Google Cloud Console, create a **Web application** OAuth client and add the preview origin, currently `http://localhost:4173`, to **Authorized JavaScript origins**. If the preview port changes, register that exact origin too. Add the exact production origin before deployment.
5. Copy `.env.example` to `.env.local` and replace both placeholder values:

   ```env
   VITE_FIREBASE_API_KEY=your_firebase_web_api_key
   VITE_GOOGLE_CLIENT_ID=your_google_oauth_web_client_id.apps.googleusercontent.com
   ```

6. Restart the Vite development server after changing environment values.

Do not place a Firebase Admin SDK key, service-account JSON, client secret, or any server credential in these `VITE_` variables. They are browser-visible web configuration values.

Official references: [Firebase Auth REST API](https://firebase.google.com/docs/reference/rest/auth/) and [Google Sign-In button setup](https://developers.google.com/identity/gsi/web/guides/display-button).
