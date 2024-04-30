Module.register("MMM-ParliPoints", {
    start: function() {
        console.log(`sending config: ${JSON.stringify(this.config)}`);
        this.sendSocketNotification("CONFIG", this.config);
    },

    getDom: function() {
        const wrapper = document.createElement("div");
        wrapper.className = "email-results";

        this.resultElement = document.createElement("div");
        this.resultElement.className = "email-result";
        this.resultElement.innerHTML = "Loading...";
        wrapper.appendChild(this.resultElement);

        return wrapper;
    },

    getHeader: function() {
        return "Parli Points";
    },

    socketNotificationReceived: function(notification, payload) {
        console.log(`received notification: ${notification}`);
        console.log(`payload: ${JSON.stringify(payload)}`);
        if (notification === 'POINTS_AWARDED') {
            const todaysPoints = payload;
            this.displayPointsAwarded(todaysPoints);
        } else {
            console.log(`Received: ${notification}`);
        }
    },

    displayPointsAwarded: function(pointsAwarded) {
        this.resultElement.innerHTML = '';
        this.divElement = document.createElement("div");
        this.paragraphElement = document.createElement('span');
        let lines = pointsAwarded.split('\n');
        lines.forEach((line) => {
            this.paragraphElement.appendChild(document.createTextNode(line));
            this.paragraphElement.appendChild(document.createElement('BR'));
        });
        this.divElement.appendChild(this.paragraphElement);
        this.resultElement.appendChild(this.divElement);
    },
});
