// "Controllers are responsible for handling HTTP requests and responses.
//  They receive the request, call the appropriate service,
//   and return the result to the client.


const HttpError = require('../utils/httpError');
const authService = require('../services/auth.service');

/** POST /auth/google — mirrors google_login(). */
const googleLogin = async (req, res) => {
  try {
    const { token } = req.body || {};
    console.log('Incoming Google Auth request');
    if (!token) return res.status(400).json({ message: 'Google token is required' });

    const googleUser = await authService.verifyGoogleIdToken(token);
    const email = googleUser.email;
    const name = googleUser.name || 'User';
    if (!email) return res.status(400).json({ message: 'Email is required' });

    console.log('Creating or finding user:', email);
    const result = await authService.loginOrRegisterGoogleUser(email, name);
    res.cookie('token', result.token, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    console.log('Google auth successful for:', email);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Google auth error:', error.message || error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ message: statusCode < 500 ? (error.detail || error.message) : 'Google authentication failed' });
  }
};

/** POST /auth/logout — mirrors logout(). Stateless JWT, so just acks. */
const logout = async (req, res) => {
  try {
    res.clearCookie('token', { httpOnly: true, secure: false, sameSite: 'lax' });
    return res.status(200).json({ ok: true, message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error.message || error);
    return res.status(500).json({ message: 'Logout failed' });
  }
};

/** GET /auth/me — mirrors get_me(). */
const getMe = async (req, res) => {
  try {
    const user = await authService.getUserByEmail(req.userEmail);
    if (!user) return res.status(404).json({ detail: 'User not found' });
    user._id = String(user._id);
    return res.json(user);
  } catch (error) {
    console.error('Get profile error:', error.message || error);
    return res.status(500).json({ detail: 'Could not load user profile' });
  }
};

/** PATCH /auth/profile — mirrors update_profile(). */
const updateProfile = async (req, res) => {
  try {
    const { fullName } = req.body || {};
    const updateFields = {};
    if (fullName) updateFields.fullName = String(fullName).trim();
    if (Object.keys(updateFields).length === 0) return res.status(400).json({ detail: 'No fields to update' });

    await authService.updateUserProfile(req.userEmail, updateFields);
    return res.json({ ok: true, updated: updateFields });
  } catch (error) {
    console.error('Update profile error:', error.message || error);
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    return res.status(statusCode).json({ detail: error.detail || 'Could not update profile' });
  }
};

module.exports = { googleLogin, logout, getMe, updateProfile };
