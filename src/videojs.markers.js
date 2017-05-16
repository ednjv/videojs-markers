/*
 * videojs-markers
 * @flow
 */

'use strict';

import videojs from 'video.js';

type Marker = {
  time: number,
  text?: string,
  class?: string,
  overlayText?: string,
  // private property
  key: string,
};

// default setting
const defaultSetting = {
  markerStyle: {
    'width':'7px',
    'border-radius': '30%',
    'background-color': 'red',
  },
  markerTip: {
    display: true,
    text: function(marker) {
      return "Break: " + marker.text;
    },
    time: function(marker) {
      return marker.time;
    },
  },
  breakOverlay:{
    display: false,
    displayTime: 3,
    text: function(marker) {
      return "Break overlay: " + marker.overlayText;
    },
    style: {
      'width':'100%',
      'height': '20%',
      'background-color': 'rgba(0,0,0,0.7)',
      'color': 'white',
      'font-size': '17px',
    },
  },
  onMarkerClick: function(marker) {},
  onMarkerReached: function(marker, index) {},
  markers: [],
};

// create a non-colliding random number
function generateUUID(): string {
  var d = new Date().getTime();
  var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    var r = (d + Math.random()*16)%16 | 0;
    d = Math.floor(d/16);
    return (c=='x' ? r : (r&0x3|0x8)).toString(16);
  });
  return uuid;
};

const NULL_INDEX = -1;

function registerVideoJsMarkersPlugin(options) {
  /**
   * register the markers plugin (dependent on jquery)
   */

  let setting = videojs.mergeOptions(defaultSetting, options),
      markersMap: {[key:string]: Marker} = {},
      markersList: Array<Marker>  = [], // list of markers sorted by time
      currentMarkerIndex  = NULL_INDEX,
      player       = this,
      markerTip    = null,
      breakOverlay = null,
      overlayIndex = NULL_INDEX;

  function sortMarkersList(): void {
    // sort the list by time in asc order
    markersList.sort((a, b) => {
      return setting.markerTip.time(a) - setting.markerTip.time(b);
    });
  }

  function addMarkers(newMarkers: Array<Marker>): void {
    newMarkers.forEach((marker: Marker) => {
      marker.key = generateUUID();

      player.el().querySelector('.vjs-progress-holder')
        .appendChild(createMarkerDiv(marker));

      // store marker in an internal hash map
      markersMap[marker.key] = marker;
      markersList.push(marker);
    })

    sortMarkersList();
  }

  function getPosition(marker: Marker): number {
    return (setting.markerTip.time(marker) / player.duration()) * 100;
  }

  function createMarkerDiv(marker: Marker): Object {
    var markerDiv = videojs.createEl('div', {
      className: `vjs-marker ${marker.class || ""}`,
    }, {
      'data-marker-key': marker.key,
      'data-marker-time': setting.markerTip.time(marker)
    });
    Object.keys(setting.markerStyle).forEach(key => {
      markerDiv.style[key] = setting.markerStyle[key];
    });
    markerDiv.style.left = getPosition(marker) + '%';
    markerDiv.style.marginLeft = markerDiv.getBoundingClientRect().width/2 + 'px';

    // bind click event to seek to marker time
    markerDiv.addEventListener('click', function(e) {
      var preventDefault = false;
      if (typeof setting.onMarkerClick === "function") {
        // if return false, prevent default behavior
        preventDefault = setting.onMarkerClick(marker) === false;
      }

      if (!preventDefault) {
        var key = this.getAttribute('data-marker-key');
        player.currentTime(setting.markerTip.time(markersMap[key]));
      }
    });

    if (setting.markerTip.display) {
      registerMarkerTipHandler(markerDiv);
    }

    return markerDiv;
  }

  function updateMarkers(): void {
    // update UI for markers whose time changed
    markersList.forEach((marker: Marker) => {
      var markerDiv = player.el().querySelector(".vjs-marker[data-marker-key='" + marker.key +"']");
      var markerTime = setting.markerTip.time(marker);

      if (markerDiv.getAttribute('data-marker-time') !== markerTime) {
        markerDiv.style.left = getPosition(marker) + '%';
        markerDiv.setAttribute('data-marker-time', markerTime);
      }
    });
    sortMarkersList();
  }

  function removeMarkers(indexArray: Array<number>): void {
    // reset overlay
    if (!!breakOverlay){
      overlayIndex = NULL_INDEX;
      breakOverlay.style.visibility = "hidden";
    }
    currentMarkerIndex = NULL_INDEX;

    let deleteIndexList: Array<number> = [];
    indexArray.forEach((index: number) => {
      let marker = markersList[index];
      if (marker) {
        // delete from memory
        delete markersMap[marker.key];
        deleteIndexList.push(index);

        // delete from dom
        let el = player.el().querySelector(".vjs-marker[data-marker-key='" + marker.key +"']");
        el.parentNode.removeChild(el);
      }
    });

    // clean up markers array
    deleteIndexList.reverse();
    deleteIndexList.forEach((deleteIndex: number) => {
      markersList.splice(deleteIndex, 1);
    });

    // sort again
    sortMarkersList();
  }

  // attach hover event handler
  function registerMarkerTipHandler(markerDiv: Object): void {
    markerDiv.addEventListener('mouseover', () => {
      var marker = markersMap[markerDiv.getAttribute('data-marker-key')];

      if (!!markerTip) {
        markerTip.querySelector('.vjs-tip-inner').innerText = setting.markerTip.text(marker);

        // margin-left needs to minus the padding length to align correctly with the marker
        markerTip.style.left = getPosition(marker) + '%';
        markerTip.style.marginLeft = -parseFloat(markerTip.getBoundingClientRect().width) / 2 - 5 + 'px';
        markerTip.style.visibility = 'visible';
      }
    });

    markerDiv.addEventListener('mouseout',() => {
      if (!!markerTip) {
        markerTip.style.visibility = "hidden";
      }
    });
  }

  function initializeMarkerTip(): void {
    markerTip = videojs.createEl('div', {
      className: 'vjs-tip',
      innerHTML: "<div class='vjs-tip-arrow'></div><div class='vjs-tip-inner'></div>",
    });
    player.el().querySelector('.vjs-progress-holder').appendChild(markerTip);
  }

  // show or hide break overlays
  function updateBreakOverlay(): void {
    if (!setting.breakOverlay.display || currentMarkerIndex < 0) {
      return;
    }

    var currentTime = player.currentTime();
    var marker = markersList[currentMarkerIndex];
    var markerTime = setting.markerTip.time(marker);

    if (
      currentTime >= markerTime &&
      currentTime <= (markerTime + setting.breakOverlay.displayTime)
    ) {
      if (overlayIndex !== currentMarkerIndex) {
        overlayIndex = currentMarkerIndex;
        if (breakOverlay) {
          breakOverlay.querySelector('.vjs-break-overlay-text').innerHTML = setting.breakOverlay.text(marker);
        }
      }

      if (breakOverlay) {
        breakOverlay.style.visibility = "visible";
      }
    } else {
      overlayIndex = NULL_INDEX;
      if (breakOverlay) {
        breakOverlay.style.visibility = "hidden";
      }
    }
  }

  // problem when the next marker is within the overlay display time from the previous marker
  function initializeOverlay(): void {
    breakOverlay = videojs.createEl('div', {
      className: 'vjs-break-overlay',
      innerHTML: "<div class='vjs-break-overlay-text'></div>"
    });
    Object.keys(setting.breakOverlay.style).forEach(key => {
      breakOverlay.style[key] = setting.breakOverlay.style[key]
    });
    player.el().appendChild(breakOverlay);
    overlayIndex = NULL_INDEX;
  }

  function onTimeUpdate(): void {
    onUpdateMarker();
    updateBreakOverlay();
    options.onTimeUpdateAfterMarkerUpdate && options.onTimeUpdateAfterMarkerUpdate();
  }

  function onUpdateMarker() {
    /*
      check marker reached in between markers
      the logic here is that it triggers a new marker reached event only if the player
      enters a new marker range (e.g. from marker 1 to marker 2). Thus, if player is on marker 1 and user clicked on marker 1 again, no new reached event is triggered)
    */
    if (!markersList.length) {
      return;
    }

    var getNextMarkerTime = (index: number) => {
      if (index < markersList.length - 1) {
        return setting.markerTip.time(markersList[index + 1]);
      }
      // next marker time of last marker would be end of video time
      return player.duration();
    }
    var currentTime = player.currentTime();
    var newMarkerIndex = NULL_INDEX;

    if (currentMarkerIndex !== NULL_INDEX) {
      // check if staying at same marker
      var nextMarkerTime = getNextMarkerTime(currentMarkerIndex);
      if(
        currentTime >= setting.markerTip.time(markersList[currentMarkerIndex]) &&
        currentTime < nextMarkerTime
      ) {
        return;
      }

      // check for ending (at the end current time equals player duration)
      if (
        currentMarkerIndex === markersList.length - 1 &&
        currentTime === player.duration()
      ) {
        return;
      }
    }

    // check first marker, no marker is selected
    if (currentTime < setting.markerTip.time(markersList[0])) {
      newMarkerIndex = NULL_INDEX;
    } else {
      // look for new index
      for (var i = 0; i < markersList.length; i++) {
        nextMarkerTime = getNextMarkerTime(i);
        if (
          currentTime >= setting.markerTip.time(markersList[i]) &&
          currentTime < nextMarkerTime
        ) {
          newMarkerIndex = i;
          break;
        }
      }
    }

    // set new marker index
    if (newMarkerIndex !== currentMarkerIndex) {
      // trigger event if index is not null
      if (newMarkerIndex !== NULL_INDEX && options.onMarkerReached) {
        options.onMarkerReached(markersList[newMarkerIndex], newMarkerIndex);
      }
      currentMarkerIndex = newMarkerIndex;
    }
  }

  // setup the whole thing
  function initialize(): void {
    if (setting.markerTip.display) {
      initializeMarkerTip();
    }

    // remove existing markers if already initialized
    player.markers.removeAll();
    addMarkers(options.markers);

    if (setting.breakOverlay.display) {
      initializeOverlay();
    }
    onTimeUpdate();
    player.on("timeupdate", onTimeUpdate);
    player.off("loadedmetadata");
  }

  // setup the plugin after we loaded video's meta data
  player.on("loadedmetadata", function() {
    initialize();
  });

  // exposed plugin API
  player.markers = {
    getMarkers: function(): Array<Marker> {
      return markersList;
    },
    next : function(): void {
      // go to the next marker from current timestamp
      const currentTime = player.currentTime();
      for (var i = 0; i < markersList.length; i++) {
        var markerTime = setting.markerTip.time(markersList[i]);
        if (markerTime > currentTime) {
          player.currentTime(markerTime);
          break;
        }
      }
    },
    prev : function(): void {
      // go to previous marker
      const currentTime = player.currentTime();
      for (var i = markersList.length - 1; i >= 0 ; i--) {
        var markerTime = setting.markerTip.time(markersList[i]);
        // add a threshold
        if (markerTime + 0.5 < currentTime) {
          player.currentTime(markerTime);
          return;
        }
      }
    },
    add : function(newMarkers: Array<Marker>): void {
      // add new markers given an array of index
      addMarkers(newMarkers);
    },
    remove: function(indexArray: Array<number>): void {
      // remove markers given an array of index
      removeMarkers(indexArray);
    },
    removeAll: function(): void {
      var indexArray = [];
      for (var i = 0; i < markersList.length; i++) {
        indexArray.push(i);
      }
      removeMarkers(indexArray);
    },
    updateTime: function(): void {
      // notify the plugin to update the UI for changes in marker times
      updateMarkers();
    },
    reset: function(newMarkers: Array<Marker>): void {
      // remove all the existing markers and add new ones
      player.markers.removeAll();
      addMarkers(newMarkers);
    },
    destroy: function(): void {
      // unregister the plugins and clean up even handlers
      player.markers.removeAll();
      breakOverlay && breakOverlay.remove();
      markerTip && markerTip.remove();
      player.off("timeupdate", updateBreakOverlay);
      delete player.markers;
    },
  };
}

videojs.plugin('markers', registerVideoJsMarkersPlugin);
