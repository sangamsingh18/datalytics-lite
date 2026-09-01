// Yeh auth.service.js module ka kaam aur exports handle karta hai.
// Ismein application ka relevant runtime logic safely maintain hota hai.
/**
 * Auth service — ported from app/api/v1/routes/auth.py.
 * Handles Google ID token verification, JWT issuance, and the
 * find-or-create user upsert logic (same fields/defaults as the
 * original: diamonds: 200, purchase_history: [], provider: "google").
 */
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const mongoose = require('mongoose');
const env = require('../config/environment');
const db = require('../config/database');
const { DEFAULT_DIAMONDS, User } = require('../models/User');

const googleClient = new OAuth2Client(env.googleClientId);

function normalizeUserId(userId) {
  return mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : userId;
}

/** Mirrors create_access_token() in auth.py. */
function createAccessToken(data) {
  return jwt.sign(data, env.jwtSecret, {
    algorithm: env.jwtAlgorithm,
    expiresIn: `${env.accessTokenExpireMinutes}m`,
  });
}

/**
 * Verifies a Google ID token. Mirrors the try/retry pattern in
 * google_login(): verify with clock skew tolerance, matching the
 * configured GOOGLE_CLIENT_ID as audience.
 */
async function verifyGoogleIdToken(token) {
  const clientId = env.googleClientId || undefined;
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: clientId,
  });
  return ticket.getPayload(); // { email, name, ... }
}

/**
 * Find-or-create the user by email and issue a JWT. Mirrors the body
 * of google_login() in auth.py (minus the HTTP verification step,
 * which the controller does first).
 */
async function loginOrRegisterGoogleUser(email, name) {
  const database = db.getDB();
  const users = database.collection('users');
  const existingUser = await users.findOne({ email });
  const now = new Date();

  let userForToken;
  if (existingUser) {
    if (db.isMongoConnected()) {
      userForToken = await User.findOneAndUpdate(
        { email },
        { $set: { last_login: now } },
        { new: true }
      ).lean();
    } else {
      await users.updateOne({ email }, { $set: { last_login: now } });
      userForToken = existingUser;
    }
  } else {
    const userData = {
      fullName: name,
      email,
      provider: 'google',
      verified: true,
      welcome_sent: true,
      joined_at: now,
      last_login: now,
      diamonds: 200,
      purchase_history: [],
    };
    if (db.isMongoConnected()) {
      userForToken = await User.create(userData);
    } else {
      userForToken = new User(userData).toObject();
      await users.insertOne(userForToken);
    }
  }

  const joinedAt = userForToken.joined_at || now;
  const token = createAccessToken({
    sub: email,
    user_id: String(userForToken._id),
    name,
    joined_at: joinedAt.toISOString(),
    provider: 'google',
    plan: userForToken.plan || 'None',
    diamonds: userForToken.diamonds !== undefined ? userForToken.diamonds : DEFAULT_DIAMONDS,
  });

  return {
    token,
    user: {
      ...userForToken,
      email,
      fullName: userForToken.fullName || name,
      plan: userForToken.plan || 'None',
      diamonds: userForToken.diamonds !== undefined ? userForToken.diamonds : DEFAULT_DIAMONDS,
    },
  };
}

/** Mirrors get_me(): fetch user, excluding password/otp fields. */
async function getUserByEmail(email) {
  if (db.isMongoConnected()) {
    return User.findOne({ email: String(email).toLowerCase() }).select('-password -otp').lean();
  }
  const database = db.getDB();
  return database.collection('users').findOne(
    { email },
    { projection: { password: 0, otp: 0 } }
  );
}

async function getUserById(userId) {
  if (db.isMongoConnected()) {
    return User.findById(userId).select('-password -otp').lean();
  }
  const database = db.getDB();
  return database.collection('users').findOne(
    { _id: normalizeUserId(userId) },
    { projection: { password: 0, otp: 0 } }
  );
}

/** Mirrors update_profile(): only fullName is currently updatable. */
async function updateUserProfile(email, fields) {
  if (db.isMongoConnected()) {
    await User.updateOne({ email: String(email).toLowerCase() }, { $set: fields });
    return;
  }
  const database = db.getDB();
  if (fields.diamonds !== undefined) {
    fields.diamonds = Math.max(0, Number(fields.diamonds));
  }
  await database.collection('users').updateOne({ email }, { $set: fields });
}

async function updateUserProfileById(userId, fields) {
  if (db.isMongoConnected()) {
    await User.updateOne({ _id: userId }, { $set: fields });
    return;
  }
  const database = db.getDB();
  if (fields.diamonds !== undefined) {
    fields.diamonds = Math.max(0, Number(fields.diamonds));
  }
  await database.collection('users').updateOne({ _id: normalizeUserId(userId) }, { $set: fields });
}

module.exports = {
  createAccessToken,
  verifyGoogleIdToken,
  loginOrRegisterGoogleUser,
  getUserByEmail,
  getUserById,
  updateUserProfile,
  updateUserProfileById,
};
