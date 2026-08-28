# Mooligan mobile

The iOS and Android client is an Expo development-build project. Its current
scope is the native app shell, Home and Settings navigation, and a Device-local
appearance preference. It does not create, open, or synchronize a Workspace.

From the repository root:

```bash
vp install
vp run mobile#ios
vp run mobile#android
```

Android native builds require JDK 17. On Apple silicon with Homebrew, run the
Android command with the installed JDK if Java is not already configured:

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  vp run mobile#android
```

After installing a development build, start Metro without rebuilding native
code:

```bash
vp run mobile#dev
```

Expo generates `ios/` and `android/` from `app.json`; both directories stay out
of version control.
