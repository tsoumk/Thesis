require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
var session = require('express-session');
const mongoose = require("mongoose");
const md5 = require("md5");
var os = require("os");

const app = express();

//USES
app.use(session({
  secret: 'machine-learning',
  resave: true,
  saveUninitialized: false,
  cookie: {
      expires: 600000
  }
}));
app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({extended: true}));

var platform = os.platform();
//console.log(platform);

//LOCAL
if ( platform == 'win32' ){
  mongoose.connect("mongodb://localhost:27017/test", {useNewUrlParser: true});
}
//HEROKU
else{
  mongoose.connect("mongodb://kostis:kostis77@ds117178.mlab.com:117178/heroku_1vfsrfbc", {useNewUrlParser: true});
}

const userSchema = new mongoose.Schema({
  email: String,
  password: String
});

const visitSchema = new mongoose.Schema({
  user_id: String,
  query: String,
  rating: Number,
});

const hotelSchema = new mongoose.Schema({
  id: String,
  name: String,
  location: String,
  rating: Number,
  price: Number,
  reviews_count: Number,
  score: Number,
  visits: [visitSchema]
});

//ROUTES
app.get("/", function(req, res){ res.render("home"); });
app.get("/login", function(req, res){
  let user_register = false;
  if ( req.session.user_register === true ){
    user_register = true;
    req.session.user_register = null;
  }
  res.render("login", {user_register: user_register});
});
app.get("/register", function(req, res){ res.render("register"); });

//CONFIRM BOOKING
app.get("/confirm", requiresLogin, function(req, res){ res.render("confirm"); });

//USER HOTEL VISITS
app.get("/visits", requiresLogin, function(req, res){
  let user_id = req.session.user_sid;
  //user_id = '5d2a2cc61e90d8286c007705';
  console.log(user_id);
  if ( user_id !== '' ){
    let Hotel = mongoose.model("Hotel", hotelSchema);
    Hotel.find( { visits: {$elemMatch: {user_id: user_id} } }, function(err, visits) {
      //console.log(visits);
      res.render("visits", {visits: visits});
    });
  }
});

//PRODUCTION
app.get("/search", requiresLogin, function(req, res){ res.render("search"); });

//DEV
//app.get("/search", function(req, res){ res.render("search"); });


//AUTHENTICATE MIDDLEWARE
function requiresLogin(req, res, next) {
  //console.log(req.session.user_sid);
  if ( req.session && req.session.user_sid ){
    return next();
  } else {
    res.render("message", {message : 'You must be logged in to view this page'});
  }
}


//REGISTER
app.post("/register", function(req, res) {
  const username = req.body.username;
  const User = mongoose.model("User", userSchema);
  User.count( {email:username}, function(err, foundUser) {
    if (err) {
      console.error(err);
      res.render("message", {message : 'An error occured'});
    } else {
      if (foundUser) {
        res.render("message", {message : 'Please choose another email'});
      } else{
        const password = md5(req.body.password).toUpperCase();
        const newUser = new User({email: username, password: password});
        newUser.save(function(err) {
          if (err) {
            console.log(err);
            res.render("message", {message : 'An error occured'});
          } else {
            req.session.user_register = true;
            res.redirect("login");
          }
        });
      }
    }
  });
});


//LOGIN
app.post("/login", function(req, res) {
  const username = req.body.username;
  const password = md5(req.body.password);
  const User = mongoose.model("User", userSchema);
  //console.log(password);
  User.findOne({
    email: username
  }, function(err, foundUser) {
    if (err) {
      console.error(err);
      res.render("message", {message : 'An error occured'});
    } else {
      if (foundUser) {
        if (foundUser.password == password.toUpperCase()) {
          req.session.user_sid = foundUser._id;
          //console.log(req.session.user_sid);
          res.redirect("visits");
        } else{
          res.render("message", {message : 'Invalid login'});
        }
      } else{
        res.render("message", {message : 'Invalid login'});
      }
    }
  });
});


//HOTEL SEARCH
app.post('/search', (req, res) => {

  let query = req.body.query;
  let rating = 0;
  if ( req.body.rating ){
    rating = parseInt(req.body.rating);
  }
  console.log(query, rating);

  let Hotel = mongoose.model("Hotel", hotelSchema);

  //FULL TEXT SEARCH
  //hotelSchema.index({"$**":"text"});
  hotelSchema.index({
    name: 'text',
    location: 'text',
  });

  Hotel.find({ rating: { $gte: rating }, $text: { $search: query }}, {score: {$meta: "textScore"}}, function(err, items) {
    //console.log(items);
    items = train(items, query, rating);
    res.render("search", {items: items, query: query, 'rating': rating});
  })
  //SORT
  .sort({ score:{ $meta:"textScore" }, 'rating': 'desc', 'reviews_count': 'desc', 'price': 'asc', 'name': 'asc'} );

});


//SEARCH ALGORITHM
function train(items, query, rating){
  const visit_weight = 0.01;
  const query_weight = 0.02;
  const rating_weight = 0.02;
  //const location_weight = 0.02;
  const match_weight = 0.05;
  if ( items !== undefined && items.length ){
      for(let i = 0; i < items.length; i++){
        if ( items[i].visits.length ){
          items[i].score += (items[i].visits.length * visit_weight);
          let matchQuery = false;
          let matchRating = false;
          //let matchLocation = false;
          for(let j = 0; j < items[i].visits.length; j++){
            if ( items[i].visits[j].query == query ){
              items[i].score += query_weight;
              matchQuery = true;
            }
            if ( rating > 0 && items[i].visits[j].rating == rating ){
              items[i].score += rating_weight;
              matchRating = true;
            }
            if ( matchQuery && matchRating ){
              items[i].score += match_weight;
            }
          }
        }
      }
  }
  return items;
}


//BOOK HOTEL
app.get('/book', requiresLogin, function(req, res, next) {
  if ( req.query.id == undefined ){
    next();
  } else{
    var user_id = req.session.user_sid;
    let hotel_id = req.query.id;
    let query = req.query.query;
    let rating = req.query.rating;
    console.log(hotel_id, user_id);
    const Hotel = mongoose.model("Hotel", hotelSchema);
    Hotel.findOneAndUpdate(
      {_id: hotel_id},
      {$push: {'visits': { query:query, rating: rating, user_id: user_id } }},
      {upsert:true},
      function(err, doc){
        if (err){
          console.error(err);
          res.render("message", {message : 'An error occured'});
        }
        //return res.send("succesfully saved");
        return res.redirect('confirm');
    });
  }
});


//LOGOUT
app.get('/logout', function(req, res, next) {
  if (req.session) {
    req.session.destroy(function(err) {
      if(err) {
        return next(err);
      } else {
        return res.redirect('/');
      }
    });
  }
});

app.use(function (req, res, next){ res.status(404).send("Page not found"); });

const port = process.env.PORT || 3000;
app.listen(port, function() {
  console.log("Server started on port 3000.");
});
