const passport = require("passport");
const { Strategy: JwtStrategy, ExtractJwt } = require("passport-jwt");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const { User } = require("../models");

// JWT Strategy
passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    },
    async (payload, done) => {
      try {
        const user = await User.findByPk(payload.id);
        if (!user || user.isBanned) return done(null, false);
        return done(null, user);
      } catch (err) {
        return done(err, false);
      }
    },
  ),
);

// Google Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== "your_google_client_id") {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ where: { googleId: profile.id } });
          if (!user) {
            user = await User.findOne({ where: { email: profile.emails[0].value } });
            if (user) {
              await user.update({ googleId: profile.id });
            } else {
              user = await User.create({
                username: profile.displayName.replace(/\s/g, "_").toLowerCase() + "_" + Date.now(),
                email: profile.emails[0].value,
                googleId: profile.id,
                avatar: profile.photos[0]?.value,
                isVerified: true,
              });
            }
          }
          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      },
    ),
  );
}

// GitHub Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_ID !== "your_github_client_id") {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL,
        scope: ["user:email"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ where: { githubId: profile.id.toString() } });
          if (!user) {
            const email = profile.emails?.[0]?.value || `${profile.username}@github.com`;
            user = await User.findOne({ where: { email } });
            if (user) {
              await user.update({ githubId: profile.id.toString() });
            } else {
              user = await User.create({
                username: profile.username + "_" + Date.now(),
                email,
                githubId: profile.id.toString(),
                avatar: profile.photos[0]?.value,
                isVerified: true,
              });
            }
          }
          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      },
    ),
  );
}
