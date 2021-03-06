var url = require('url');
var oauth2orize = require('oauth2orize');
var oauthServer = require('./oauth');
var oauthModels = require('./models/oauth');

module.exports = function(app, passport, logger) {

	logger.debug("loading oAuth endpoints");


	app.get('/oauth', function(req,res){
		res.render('pages/oauth',{user: req.user, message: req.flash('error')});
	});

	app.get('/auth/start',oauthServer.authorize(function(applicationID, redirectURI,done) {

		logger.debug("Starting oAuth start");
		logger.debug("applicationID: ", applicationID)
		logger.debug("applicationID type: ", (typeof applicationID))
		if (typeof applicationID == "string") {
			logger.debug("converting");
			applicationID = parseInt(applicationID)
		}
		logger.debug("applicationID: ", applicationID)
		logger.debug("applicationID type: ", (typeof applicationID))

		oauthModels.Application.findOne({ oauth_id: applicationID }, function(error, application) {
			logger.debug(application)
			if (application) {
				logger.info("Starting oAuth flow for " + application.title);
				var match = false, uri = url.parse(redirectURI || '');
				for (var i = 0; i < application.domains.length; i++) {
					if (uri.host == application.domains[i] || (uri.protocol == application.domains[i] && uri.protocol != 'http' && uri.protocol != 'https')) {
						match = true;
						break;
					}
				}
				if (match && redirectURI && redirectURI.length > 0) {
					done(null, application, redirectURI);
				} else {
					logger.debug("redirect URI does not match ", redirectURI, application.domains);
					done(new Error("You must supply a redirect_uri that is a domain or url scheme owned by your app."), false);
				}
			} else if (!error) {
				logger.debug("No oAuth Application found");
				done(new Error("There is no app with the client_id you supplied."), false);
			} else {
				logger.debug("Error getting oAuth application ",error);
				done(error);
			}
		});
	}),function(req,res){
		var scopeMap = {
			// ... display strings for all scope variables ...
			access_devices: 'access you devices',
			create_devices: 'create new devices'
		};

		res.render('pages/oauth', {
			transaction_id: req.oauth2.transactionID,
			currentURL: encodeURIComponent(req.originalUrl),
			response_type: req.query.response_type,
			errors: req.flash('error'),
			oAuthScope: req.oauth2.req.scope,
			application: req.oauth2.client,
			user: req.user,
			map: scopeMap
		});
	});

	app.post('/auth/finish',function(req,res,next) {
		logger.info("/auth/finish");
		logger.debug("body: ", req.body);
		logger.debug("params: ", req.params);
		if (req.user) {
			logger.debug("oAuth, already logged in");
			next();
		} else {
			passport.authenticate('local', {
				session: false
			}, function(error,user,info){
				logger.debug("oAuth finish authenticating");
				if (user) {
					logger.debug(user.username);
					req.user = user;
					logger.debug("oAuth user logged in: ", req.user);
					next();
				} else if (!error){
					logger.debug("Wrong username/password oAuth");
					req.flash('error', 'Your email or password was incorrect. Please try again.');
					res.redirect(req.body['auth_url'])
				} else if (error) {
					logger.debug("oAuth finish error: ", error)
				}
	 		})(req,res,next);
		}
	}, oauthServer.decision(function(req,done){
		//logger.debug("decision user: ", req);
		done(null, { scope: req.oauth2.req.scope });
	}));

	app.post('/auth/exchange',function(req,res,next){
		var appID = req.body['client_id'];
		var appSecret = req.body['client_secret'];

		oauthModels.Application.findOne({ oauth_id: appID, oauth_secret: appSecret }, function(error, application) {
			if (application) {
				logger.debug("oAuth exchange ", application.title);
				req.appl = application;
				next();
			} else if (!error) {
				error = new Error("There was no application with the Application ID and Secret you provided.");
				next(error);
			} else {
				next(error);
			}
		});
	}, oauthServer.token(), oauthServer.errorHandler());
}