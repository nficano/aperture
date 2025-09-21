declare module '@sentry/node' {
  const Sentry: any;
  export default Sentry;
  export { Sentry };
}

declare module 'firebase-admin' {
  interface FirebaseApp {
    firestore?: () => unknown;
  }

  interface FirebaseAdmin {
    apps: FirebaseApp[];
    initializeApp(): FirebaseApp;
  }

  const firebaseAdmin: FirebaseAdmin;
  export default firebaseAdmin;
  export { firebaseAdmin, FirebaseAdmin, FirebaseApp };
}
