'use strict';

var express = require('express');
var donationRouter = express.Router();

<<<<<<< HEAD
var env = require('node-env-file');
env(__dirname + '/../.env');
=======
require('./env.js');
>>>>>>> 7ae51e3a33eb8729b28238fb0dd538dc45f7cd0c

var SECRET_KEY = process.env.SECRETKEY;

var stripe = require('stripe')(SECRET_KEY);

donationRouter.post('/donate', function (req, res) {
  var stripeToken = req.body.token;
  var amount = req.body.amount;
  stripe.charges.create({
    card: stripeToken,
    currency: 'usd',
    amount: amount,
  }, function (err, charge) {
    if (err) {
      res.status(501).send(err);
    } else {
      res.status(204).send(charge);
    }
  });
});

module.exports = donationRouter;
