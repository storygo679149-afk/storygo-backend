const { query } = require('../config/database');

exports.checkPremiumAccess = async (req, res, next) => {
    try {
        const episode = req.episode;
        const user = req.user;

        // Premium users always allowed
        if (user && user.is_premium) return next();

        // Episodes 1-20 are free (even if user is not authenticated)
        if (episode.episode_number <= 20) {
            // Still attach ads flag for non-premium users
            if (!user || !user.is_premium) req.shouldShowAds = true;
            return next();
        }

        // Episode > 20: authentication required
        if (!user) {
            return res.status(401).json({
                locked: true,
                message: 'Login to continue listening. Subscribe to unlock all episodes.'
            });
        }

        // Authenticated but not premium
        return res.status(402).json({
            locked: true,
            message: 'Subscribe to unlock premium episodes.',
            upgradeUrl: '/subscription'
        });
    } catch (err) {
        next(err);
    }
};

exports.adsMiddleware = (req, res, next) => {
    // Attach a flag for the response to indicate ads should be shown
    req.shouldShowAds = !req.user?.is_premium;
    next();
};