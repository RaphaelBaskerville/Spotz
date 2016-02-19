'use strict';
angular.module('MapServices', ['AdminServices'])

.factory('MapFactory', ['$rootScope', '$http', '$window', '$timeout', '$cookies', 'KeyFactory', function ($rootScope, $http, $window, $timeout, $cookies, KeyFactory) {

  //world grid calculations
  var stepX = 0.018;
  var stepY = 0.018;

  //google tooltip
  var infowindow = {};

  //map view boundary
  var topRightX;
  var topRightY;
  var bottomLeftX;
  var bottomLeftY;

  //remember what we fetched
  var downloadedGridZones = {};
  var displayedPolygons = {};

  //what we return
  var factory = {};

  var convertTime = function (inputTimeString) {
    return moment(inputTimeString, 'HH:mm:ss').format('HHmm');
  };

  var removeLeadingZero = function (timeString) {
    if (timeString.charAt(0) === '0') {
      return timeString.substring(1);
    }

    return timeString;
  };

  var computeGridNumbers = function (coordinates) {
    var x = coordinates[0];
    var y = coordinates[1];

    return [
     Math.ceil(x / stepX),
     Math.ceil(y / stepY),
    ];
  };

  // Helper function: Converts time format from 08:12:10 to 081210
  // used for calculations
  function setSelectedFeature(feature) {
    //default values
    var id = -1;
    var color = '0,0,0';

    if (feature) {
      id = feature.getProperty('id').toString();
      color = feature.getProperty('color');
    }

    //set the map factory so other UI components know about it
    factory.selectedFeature = {
      feature:feature,
      id:id,
      color:color,
    };

  }

  $rootScope.$on('logOut', function () {
    console.log('clearing downloaded info');
    downloadedGridZones = {};
    displayedPolygons = {};
  });

  // listener so we can repaint the map based on user submitted date/time/duration
  // TODO: Update logic to read parking data
  $rootScope.$on('previewRequested', function () {
    // NOTE !!!!! Change these variable names later, since they are also used in when displaying
    // availablity in the tool tip

    console.log('rendering preview');

    var preview = {
      time: '',
      date: '',
      duration: 2,
    };

    if ($rootScope.userPreview !== undefined) {
      preview.time = $rootScope.userPreview.time;
      preview.date = $rootScope.userPreview.date;
      if ($rootScope.userPreview.duration !== undefined) {
        preview.duration = $rootScope.userPreview.duration;
      }
    }

    // Convert time format form 08:12:10 to 0812
    var convPreviewTime = convertTime(preview.time);
    // console.log(convPreviewTime);
    convPreviewTime = removeLeadingZero(convPreviewTime);
    convPreviewTime = Number(convPreviewTime);  // number string becomes an integer
    //var x = +"1000"; another way to convert an string integer to a real integer

    var convStartTime = '';
    var convEndTime = '';

    // change into format HHMM  (hour Min Seconds)
    // example: 2 hours -> 2 changes to 200
    var convPreviewDuration = preview.duration + '00';
    convPreviewDuration = Number(convPreviewDuration); // number string becomes an integer

    // loop through each polygon/line and change its color
    factory.map.data.forEach(function (feature) {
      var poly = {
        rules: feature.getProperty('rules'),
        id: feature.getProperty('id'),
      };

      var userDay = preview.date.getDay();  // grab the day from the date (0 = Sunday, 1 = Monday... 6 = Saturday)

      if (poly.rules && poly.rules[0] && poly.rules[0].permitCode.indexOf('sweep') !== -1) {
        //we have a line

        // convert the time string so it can be used in a calculation
        convStartTime = convertTime(poly.rules[0].startTime);
        convEndTime = convertTime(poly.rules[0].endTime);

        // remove leading zeros, if exist
        convStartTime = removeLeadingZero(convStartTime);
        convEndTime = removeLeadingZero(convEndTime);

        // convert the number strings to integers
        convStartTime = Number(convStartTime);
        convEndTime = Number(convEndTime);

        // console.log('\n\n\nthe rules of each line: ', poly.rules[0]);

        // All Street sweeping day possiblilities
        var streetSweepingObj = {
          '1st Mon': true, '2nd Mon': true, '3rd Mon': true, '4th Mon': true,
          '1st Tue': true, '2nd Tue': true, '3rd Tue': true, '4th Tue': true,
          '1st Wed': true, '2nd Wed': true, '3rd Wed': true, '4th Wed': true,
          '1st Thurs': true, '2nd Thurs': true, '3rd Thurs': true, '4th Thurs': true,
          '1st Fri': true, '2nd Fri': true, '3rd Fri': true, '4th Fri': true,
        };

        // this first if statement is prob not needed
        if (streetSweepingObj[poly.rules[0].days]) {

          // Check for Sat or Sunday
          if (userDay === 0 || userDay === 6) {
            // paint the object green because no street sweeping on the weekends
            feature.setProperty('color', '0,255,0');
          } else {

            // This block of code will convert the user submitted date into
            // the weekday of the month it is (Example: 3rd Monday of the month)
            var ordinals = ['', '1st', '2nd', '3rd', '4th', '5th'];

            // Ex: Mon Feb 15 2016 00:00:00
            var date = preview.date.toDateString();  // 'Mon Feb 15 2016 00:00:00'
            var tokens = date.split(' ');  //[Mon, Feb, 15, 2016, 00:00:00]

            // take the date, divide by 7 and round up
            // Dividing the day by 7 will give you its number of the month.  Ex: 2nd Mon
            var weekdayOfTheMonth = ordinals[Math.ceil(tokens[2] / 7)] + ' ' + tokens[0];

            // Check if the preview date and time, intersect with the sweeping date and time
            if ((poly.rules[0].days === weekdayOfTheMonth) && (convPreviewTime > convStartTime) && (convPreviewTime < convEndTime)) {
              // parking during street sweeping time, so paint street sweeping lines red
              feature.setProperty('color', '255,0,0');
            } else {

              if ((poly.rules[0].days === weekdayOfTheMonth) && (convPreviewTime < convStartTime) && ((convPreviewTime + convPreviewDuration) > convStartTime) && ((convPreviewTime + convPreviewDuration) < convEndTime)) {
                // parking BEFORE street sweeping time, BUT duration goes into ss time, so paint street sweeping lines red');
                feature.setProperty('color', '255,0,0');

              } else if ((poly.rules[0].days === weekdayOfTheMonth) && (convPreviewTime > convEndTime) && ((convPreviewTime + convPreviewDuration - 2400) > convStartTime)) {
                // parking AFTER street sweeping time, BUT duration goes into ss time so paint street sweeping lines red
                feature.setProperty('color', '255,0,0');

              } else {
                //parking on a weekday, but outside of sweeping time so paint street sweeping lines green
                feature.setProperty('color', '0,255,0');
              }

            }

          }

        }

      } else {
        //we have a polygon
        if (poly.rules && poly.rules[0] !== undefined) {

          //Grab the permit days (M,T,W...) and put them in an array
          var daysArray = poly.rules[0].days.split(',');

          // convert the time so it can be used in a calculation
          convStartTime = convertTime(poly.rules[0].startTime);
          convEndTime = convertTime(poly.rules[0].endTime);

          // remove leading zeros, if exist
          convStartTime = removeLeadingZero(convStartTime);
          convEndTime = removeLeadingZero(convEndTime);

          //convert number strings into actual integers
          convStartTime = Number(convStartTime);
          convEndTime = Number(convEndTime);

          // No rules on Sunday (0) or Sat (if Sat is not in the daysArray length)
          if (userDay === 0  || (userDay === 6 && daysArray.length < 6)) {
            //On Sat or Sunday, no permit needed so paint the polygons green.');
            feature.setProperty('color', '0,255,0');
          }  else {

            if (  ((convPreviewTime < convStartTime) && ((convPreviewTime + convPreviewDuration) < convStartTime)) ||
              ((convPreviewTime > convEndTime) &&  ((convPreviewTime + convPreviewDuration - 2400) < convStartTime)) ) {
              // parkingMessage = 'You can park here until ' +  polygonRules.startTime + ',<br> then there is a two hour limit until' + polygonRules.endTime;
              console.log('parking outside of permit time, so paint the permit zones green');
              // polyColor = '255,192,203';  // pink fix later, need to consider duration
              // polyColor = '0,255,0';
              feature.setProperty('color', '0,255,0');
            } else {
              // parkingMessage = 'You can park here for two hours only';
              console.log('parking during permit time, so so paint the permit zones yellow');

              // polyColor = '255,255,0';  // yellow
              feature.setProperty('color', '255,255,0');
            }
          }

        }
      }

    });
  });  // End of code block that redraw the map based on date/time
  // *********************
  // *********************

  //get parking polygons + rules from server
  factory.fetchParkingZones = function (coordinates) {

    var token = $cookies.get('credentials');

    //check if we already downloaded this gridzone
    if (downloadedGridZones[JSON.stringify(computeGridNumbers(coordinates))]) {
      console.log('already got it');
      return;
    }

    //if we made it here, we need to fetch the gridzone
    //mark coordinates as downloaded
    downloadedGridZones[JSON.stringify(computeGridNumbers(coordinates))] = true;

    $http({
      method:'GET',
      url: '/api/zones/' + coordinates[0] + '/' + coordinates[1] + '/' + token,
    })
    .success(function (data) {
      $rootScope.$broadcast('mapLoaded');
      var polyColor;
      var boundary;
      var p;

      //loop through zone data and put them on the map
      data.forEach(function (poly, i) {

        //check if we already displayed this polygon
        if (displayedPolygons[poly.id]) {
          console.log('already displayed this polygon');
          return;
        }

        //if we made it here, we need to display this polygon
        //mark polygon as displayed
        displayedPolygons[poly.id] = true;

        //color the zone
        polyColor = '0,0,0';
        if (poly.rules[0]) {
          polyColor = poly.rules[0].color;
        }

        //make a geoJSON object to be placed on the map
        //http://geojson.org/geojson-spec.html
        //google maps accepts this type of data

        boundary = JSON.parse(poly.boundary);
        if (poly.rules[0] && poly.rules[0].permitCode.indexOf('sweep') !== -1) {
          //we have a line
          p = {
            type: 'Feature',
            properties:{
              rules: poly.rules,
              index: i,
              color: polyColor,
              id: poly.id,
              parkingCode:poly.parkingCode,
            },
            geometry:{
              type: 'LineString',
              coordinates: boundary,
            },
          };
        } else {
          //we have a polygon
          p = {
            type: 'Feature',
            properties:{
              rules: poly.rules,
              index: i,
              color: polyColor,
              id: poly.id,
              parkingCode:poly.parkingCode,
            },
            geometry:{
              type: 'MultiPolygon',
              coordinates: [[boundary]],
            },
          };

        }

        //actually put it on the map
        factory.map.data.addGeoJson(p);

      });

      //how to set the color based on the rule table
      factory.map.data.setStyle(function (feature) {
        var weight = 1;

        if (!feature.getProperty('color')) {
          return;
        }

        if (feature.getProperty('rules') && feature.getProperty('rules')[0] && feature.getProperty('rules')[0].permitCode.indexOf('sweep') !== -1) {
          weight = 3;
        }

        return ({
           strokeColor: 'rgba(' + feature.getProperty('color') + ', 1.0)',    // color will be given as '255, 123, 7'
           fillColor:'rgba(' + feature.getProperty('color')  + ', 0.7)',
           strokeWeight: weight,
         });
      });

      // NOTE TO DO:
      // Function to display parking options at current time
      // Input is the rules object
      // Output is string to display the options

      // var parkingOptionRightNow = function (rulesObj) {
      //   var date = moment().format('MM-DD-YYYY');
      //   var currentTime = moment().format('h:mm a');
      // };
    });
  };

  function addDeleteButtonClickHandlers() {

    //add listeners for the remove rule buttons
    var deleteButtons = document.getElementsByClassName('delete-rule');
    for (var i = 0; i < deleteButtons.length; i++) {
      google.maps.event.addDomListener(deleteButtons[i], 'click', function (deleteButton) {
        console.log('Map was clicked!', this.dataset.polyid, this.dataset.ruleid);
        if (confirm('Are you sure you want to delete this rule?')) {
          factory.deleteRule(this.dataset.polyid, this.dataset.ruleid).then(function (rules) {
            factory.selectedFeature.feature.setProperty('rules', rules);
            factory.refreshTooltipText(factory.selectedFeature.feature);
          });
        }
      });
    }

    //add listeners for the remove polygon button
    var deletePolygon = document.getElementsByClassName('delete-polygon');
    google.maps.event.addDomListener(deletePolygon[0], 'click', function (deleteButton) {
      console.log('Map was clicked!', this.dataset.polyid);
      if (confirm('Are you sure you want to delete this polygon?')) {
        factory.deleteParkingZone(this.dataset.polyid).then(function (succeeded) {
          if (succeeded) {
            console.log('removing', factory.selectedFeature.feature);
            factory.map.data.remove(factory.selectedFeature.feature);
            infowindow.close();
            console.log('delete complete');
          } else {
            console.log('delete failed');
          }
        });
      }
    });
  }

  factory.deleteParkingZone = function (polyId) {
    var token = $cookies.get('credentials');

    return $http.delete('/api/zones/' + polyId + '/' + token)
    .success(function (data) {
      console.log('deleted!', data);
      return true;
    })
    .error(function (err) {
      console.log('delete failed', err);
      return false;
    });
  };

  factory.refreshTooltipText = function (feature) {

    var rulesToDisplay = createTooltipText(feature);

    //infowindow points to a google map infowindow object
    //append the content and set the location, then display it
    infowindow.setContent('<span class="tooltip-text">' + rulesToDisplay + '</span>', event);
    infowindow.open(factory.map);
    addDeleteButtonClickHandlers();
  };

  function createTooltipText(feature) {

    var numOfRules;

    if (!event) {
      console.log('failed to create the toooltip, no event given');
      return;
    }

    if (feature.getProperty('rules')) {
      numOfRules = feature.getProperty('rules').length;
    }

    var rulesToDisplay = '';

    // Capture the user submitted time and date
    var preview = {
      time: '',
      date: '',
    };

    if ($rootScope.userPreview !== undefined) {
      preview.time = $rootScope.userPreview.time;
      preview.date = $rootScope.userPreview.date;
    }

    var polygonRules = {};

    for (var i = 0; i < numOfRules; i++) {
      rulesToDisplay += 'Permit code: ' + feature.getProperty('rules')[i].permitCode + '<br>';

      polygonRules.days = feature.getProperty('rules')[i].days;
      rulesToDisplay += 'Days: ' + feature.getProperty('rules')[i].days + '<br>';

      polygonRules.timeLimit = feature.getProperty('rules')[i].timeLimit;
      rulesToDisplay += polygonRules.timeLimit + 'hrs' + '<br>';

      polygonRules.startTime = feature.getProperty('rules')[i].startTime;
      rulesToDisplay +=  polygonRules.startTime + ' to ';

      polygonRules.endTime = feature.getProperty('rules')[i].endTime;
      rulesToDisplay += polygonRules.endTime + '<br>';

      polygonRules.costPerHour = feature.getProperty('rules')[i].costPerHour;
      rulesToDisplay +=  'cost: $' + polygonRules.costPerHour + '<br>';

      rulesToDisplay +=  '<div class="delete-rule" data-polyId=' + feature.getProperty('id').toString() + ' data-ruleId=' + feature.getProperty('rules')[i].id + '>DELETE RULE</div><br>';

      rulesToDisplay += 'Maps may contain inaccuracies. <br><br>Not all streets in the area specific <br> maps have opted into the program.<br>';
    }

    if (!numOfRules) {
      rulesToDisplay = 'Parking info not available';

    } else if (preview.time !== '') {  //Sample Time submitted.  Display parking availability

      // NOTE update these to use removeLeadingZero function, works without it for now
      // and change them to real integers
      // Convert time format form 08:12:10 to 0812
      var convPreviewTime = convertTime(preview.time);
      var convStartTime = convertTime(polygonRules.startTime);
      var convEndTime = convertTime(polygonRules.endTime);

      // check for Sat or Sunday
      var userDay = preview.date.getDay();  // grab the day from the date (0 = Sunday, 1 = Monday... 6 = Saturday)

      // All Street sweeping day possiblilities
      var streetSweepingObj = {
        '1st Mon': true, '2nd Mon': true, '3rd Mon': true, '4th Mon': true,
        '1st Tue': true, '2nd Tue': true, '3rd Tue': true, '4th Tue': true,
        '1st Wed': true, '2nd Wed': true, '3rd Wed': true, '4th Wed': true,
        '1st Thurs': true, '2nd Thurs': true, '3rd Thurs': true, '4th Thurs': true,
        '1st Fri': true, '2nd Fri': true, '3rd Fri': true, '4th Fri': true,
      };

      var parkingMessage = '';

      // Moused over a street Sweeping Segment
      // thus polygon rules will be a street sweeping day
      // that is listed in the streetSweepingObj (Example: 4th Fri, 2nd Weds, etc)
      if (streetSweepingObj[polygonRules.days]) {

        // Check for Sat or Sunday
        if (userDay === 0 || userDay === 6) {
          parkingMessage = 'No street sweeping Sat or Sunday!';
          rulesToDisplay += '<br>' + '<strong style="color:green">' + parkingMessage + '</strong>';
        } else {

          // This block of code will convert the user submitted date into
          // the weekday of the month it is (Example: 3rd Monday of the month)
          var ordinals = ['', '1st', '2nd', '3rd', '4th', '5th'];

          // Ex: Mon Feb 15 2016 00:00:00
          var date = preview.date.toDateString();  // 'Mon Feb 15 2016 00:00:00'
          var tokens = date.split(' ');  //[Mon, Feb, 15, 2016, 00:00:00]

          // take the date, divide by 7 and round up
          // Dividing the day by 7 will give you its number of the month.  Ex: 2nd Mon
          var weekdayOfTheMonth = ordinals[Math.ceil(tokens[2] / 7)] + ' ' + tokens[0];

          // console.log('Correct day: ', weekdayOfTheMonth);
          // console.log('Street Sweeping day is: ', polygonRules.days);

          // Check if the preview date and time, matches the sweeping date and time
          if ((polygonRules.days === weekdayOfTheMonth) && (convPreviewTime > convStartTime) && (convPreviewTime < convEndTime)) {
            parkingMessage = 'WARNING: Street sweeping is occuring here <br> on the date and time you entered.';
          }

          rulesToDisplay += '<br>' + '<strong style="color:red">' + parkingMessage + '</strong>';
        }

      } else {
        // If user clicked a Permit Zone polygon (changed from 'mouse over')
        // thus polygonRuls.days will be (M, T, W, Th, F and possibly Sat)

        // console.log('\n\nRules:', polygonRules);
        var daysArray = polygonRules.days.split(',');  //Grab the permit days and put them in an array
        //console.log('Days array', daysArray);

        parkingMessage = '';

        // No rules on Sunday (0) or Sat (if Sat is not in the daysArray length)
        if (userDay === 0  || (userDay === 6 && daysArray.length < 6)) {
          parkingMessage = 'NO PERMIT REQUIRED TO PARK HERE for the date entered.';
        }  else {

          if (convPreviewTime < convStartTime || convPreviewTime > convEndTime) {
            parkingMessage = 'You can park here until ' +  polygonRules.startTime + ',<br> then you there is a two hour limit until' + polygonRules.endTime;
          } else {
            parkingMessage = 'You can park here for two hours only';
          }
        }

        rulesToDisplay += '<br>' + '<strong style="color:green">' + parkingMessage + '</strong>';
      }

    }

    rulesToDisplay += '<br>';
    rulesToDisplay +=  '<div class="delete-polygon" data-polyId=' + feature.getProperty('id').toString() + '>DELETE FEATURE</div><br>';

    return rulesToDisplay;
  }




  //to save a parking rule for a given zone id
  factory.sendRule = function (id, rule) {
    //send off the request to store the data
    var token = $cookies.get('credentials');
    return $http({
      method:'POST',
      url: '/api/rule/' + id,
      data: {
        token: token,
        rule: rule,
      },
    })
    .success(function () {
      //color the space to something
      console.log('rule saved for', id);
    });
  };

  factory.deleteRule = function (polyId, ruleId) {

    console.log('sending of request to detach rule');
    var token = $cookies.get('credentials');

    return $http({
      method:'DELETE',
      url:'/api/rule/' + polyId + '/' + ruleId + '/' + token,
    })
    .success(function (data) {
      console.log('delete rule succeeded', data);
    })
    .error(function (err) {
      console.log('delete rule failed', err);
    });
  };

  //loads the google API and sets up the map
  factory.init = function (callback) {

    //jsonp
    // added places library to api request.  Required for searchBar option
    $http.jsonp('https://maps.googleapis.com/maps/api/js?key=' + KeyFactory.map + '&libraries=places&callback=JSON_CALLBACK')
    .success(function () {

      //we have a google.maps object here!

      //create a new map and center to downtown Berkeley
      factory.map = new google.maps.Map(document.getElementById('map'), {
        zoom: 18,
        center: { lng: -122.26156639099121, lat: 37.86434903305901 },
      });
      factory.mapEvents = google.maps.event;
      //save the infowindow in a local variable
      //tooltip
      infowindow = new google.maps.InfoWindow();

      //enable tooltip display, tell it what to display
      factory.map.data.addListener('click', function (event) {
        console.log(event.feature.getProperty('id'));
        setSelectedFeature(event.feature);
        factory.refreshTooltipText(event.feature);
        infowindow.setPosition(event.latLng);
      });

      // ***** Start Google search bar functionality

      // Create the search box and link it to the UI element.
      var input = document.getElementById('pac-input');
      var searchBox = new google.maps.places.SearchBox(input);

      // Bias the SearchBox results towards current map's viewport.
      factory.map.addListener('bounds_changed', function () {
        searchBox.setBounds(factory.map.getBounds());
      });

      var markers = [];

      // Listen for the event fired when the user selects a prediction and retrieve
      // more details for that place.
      searchBox.addListener('places_changed', function () {
        var places = searchBox.getPlaces();

        if (places.length === 0) {
          return;
        }

        // Clear out the old markers.
        markers.forEach(function (marker) {
          marker.setMap(null);
        });

        markers = [];

        // For each place, get the icon, name and location.
        var bounds = new google.maps.LatLngBounds();

        places.forEach(function (place) {
          var icon = {
            url: place.icon,
            size: new google.maps.Size(10, 10),
            origin: new google.maps.Point(0, 0),
            anchor: new google.maps.Point(17, 34),
            scaledSize: new google.maps.Size(5, 5),
          };

          // Create a marker for each place.
          markers.push(new google.maps.Marker({
            map: factory.map,
            icon: icon,
            title: place.name,
            position: place.geometry.location,
          }));

          if (place.geometry.viewport) {
            // Only geocodes have viewport.
            bounds.union(place.geometry.viewport);
          } else {
            bounds.extend(place.geometry.location);
          }
        });

        factory.map.fitBounds(bounds);
        factory.map.setZoom(18);
        var newCenter = factory.map.getCenter();

        // NOTE: Every time an address is entered, the permit zones are reloaded
        // TODO: Save all the zones once they're loaded, to avoid redudant server requests

        //get the parking zones based on the new center point
        factory.fetchParkingZones([newCenter.lng(), newCenter.lat()]);

      });

      // **** End of Google search bar code

      //once the map is displayed (async), we can access information about the display
      factory.map.addListener('tilesloaded', function () {

        //view display bounds
        topRightY = factory.map.getBounds().getNorthEast().lat();
        topRightX = factory.map.getBounds().getNorthEast().lng();
        bottomLeftY = factory.map.getBounds().getSouthWest().lat();
        bottomLeftX = factory.map.getBounds().getSouthWest().lng();

        //=======================================
        //display gridlines

        //these values determine the step size of the grid lines
        var stepX = 0.018;
        var stepY = 0.018;

        //paint the vertical grid lines of only what is in the display
        var currentLine = Math.ceil(bottomLeftX / stepX) * stepX;
        var f;

        while (currentLine < topRightX) {
          f = {
            type: 'Feature',
            properties:{},
            geometry:{
              type:'LineString',
              coordinates: [[currentLine, topRightY], [currentLine, bottomLeftY]],
            },
          };

          //data format line = [ [point 1], [point 2], ....]
          factory.map.data.addGeoJson(f);
          currentLine = currentLine + stepX;
        }

        //paint the horizontal grid lines of only what is in the display
        currentLine = Math.ceil(bottomLeftY / stepY) * stepY;
        while (currentLine < topRightY) {
          //line
          f = {
            type: 'Feature',
            properties:{},
            geometry:{
              type:'LineString',
              coordinates: [[topRightX, currentLine], [bottomLeftX, currentLine]],
            },
          };

          //data format line = [ [point 1], [point 2], ....]
          factory.map.data.addGeoJson(f);
          currentLine = currentLine + stepY;
        }

      });

      //click handler to load data into the world grid squares
      factory.map.addListener('click', function (event) {
        $rootScope.$broadcast('loadMap');
        var coordinates = [event.latLng.lng(), event.latLng.lat()];
        factory.fetchParkingZones(coordinates);
      });

      //execute the callack passed in, returning the map object
      callback(factory.map);

    }).error(function (data) {
      console.log('map load failed', data);
    });
  };

  return factory;
},
]);
