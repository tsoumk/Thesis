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
  secret: 'trip',
  resave: true,
  saveUninitialized: false,
  cookie: {
      expires: 600000
  }
}));
app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));

var platform = os.platform();
//console.log(platform);

//LOCAL
if ( platform == 'win32' ){
  mongoose.connect("mongodb://localhost:27017/test", {useNewUrlParser: true});
} 
//HEROKU
else{
  mongoose.connect("mongodb://tsoumanis_db:tsoumanis_db9876@ds151247.mlab.com:51247/heroku_t1851f49", {useNewUrlParser: true});
}

const userSchema = new mongoose.Schema({
  email: String,
  password: String
});

const visitSchema = new mongoose.Schema({
  query: String,
  rating: Number
});

const hotelSchema = new mongoose.Schema({
  id: String,
  name: String,
  rating: Number,
  price: Number,
  reviews_count: Number,
  score: Number,
  visits: [visitSchema]
});

//ROUTES
app.get("/", function(req, res){ res.render("home"); });
app.get("/login", function(req, res){ res.render("login"); });
app.get("/register", function(req, res){ res.render("register"); });
app.get("/confirm", function(req, res){ res.render("confirm"); });
//app.get("/search", requiresLogin, function(req, res){ res.render("search"); });
//DEBUG
app.get("/search", function(req, res){ res.render("search"); });


//AUTHENTICATE MIDDLEWARE
function requiresLogin(req, res, next) {
  //console.log(req.session.user_sid);
  if (req.session && req.session.user_sid) {
    return next();
  } else {
    res.render("message", {message : 'You must be logged in to view this page'});
  }
}


//REGISTER
app.post("/register", function(req, res) {
  const newUser = new User({
    email: req.body.username,
    password: md5(req.body.password)
  });

  newUser.save(function(err) {
    if (err) {
      console.log(err);
    } else {
      res.redirect("login");
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
        if (foundUser.password === password.toUpperCase()) {
          req.session.user_sid = foundUser._id;
          //console.log(req.session.user_sid);
          res.redirect("search");
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
//TODO ADD MIDDLEWARE
app.post('/search', (req, res) => {
  
  let query = req.body.query;
  let rating = 0;
  if ( req.body.rating ){
    rating = parseInt(req.body.rating);
  }
  console.log(query, rating);
  
  let Hotel = mongoose.model("Hotel", hotelSchema);

  //FULL TEXT SEARCH
  hotelSchema.index({"$**":"text"});

  Hotel.find({ rating: { $gte: rating }, $text: { $search: query }}, {score: {$meta: "textScore"}}, function(err, items) {
    //console.log(items);
    items = train(items, query, rating);
    res.render("search", {items: items, query: query, 'rating': rating});
  })
  //SORT
  .sort({ score:{ $meta:"textScore" }, 'rating': 'desc', 'reviews_count': 'desc', 'price': 'asc'} );
 
});


function train(items, query, rating){
  //items.sort((a, b) => (a.price > b.price) ? 1 : -1);
  const visit_weight = 0.01;
  const query_weight = 0.02;
  const rating_weight = 0.02;
  const match_weight = 0.05;

  if ( items.length ){
      for(let i = 0; i < items.length; i++){
        if ( items[i].visits.length ){
          items[i].score += (items[i].visits.length * visit_weight);
          let matchQuery = false;
          let matchRating = false;
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


app.get('/book', function(req, res, next) {
  if ( req.query.id == undefined ){
    next();
  } else{
    let hotel_id = req.query.id;
    let query = req.query.query;
    let rating = req.query.rating;
    console.log(hotel_id);
    const Hotel = mongoose.model("Hotel", hotelSchema);
    Hotel.findOneAndUpdate(
      {_id: hotel_id},
      {$push: {'visits': { query:query, rating: rating } }},
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
