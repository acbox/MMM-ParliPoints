const NodeHelper = require('node_helper');
const NodeIMAP = require('imap');
const { EventEmitter } = require('events');
const { simpleParser } = require('mailparser');

module.exports = NodeHelper.create({
    socketNotificationReceived: function(notification, payload) {
        console.log(`received notification: ${notification}`);
        if (notification === 'CONFIG') {
            console.log(`got config: ${JSON.stringify(payload)}`);
            this.imap = new NodeIMAP(payload.imap);

            this.imap.once('ready', () => {
                this.imap.openBox('INBOX', false, (err, box) => {
                    if (err) throw err;
                    this.searchEmails();
                });
            });

            this.imap.once('error', (err) => {
                console.error('IMAP Error:', err);
            });

            this.imap.connect();
        }
    },

    searchEmails: function() {
        var self = this;
        console.log('searching emails...');
        const today = new Date();
        const startOfWeek = this.getPreviousWeekStart();
        const endOfWeek = this.getCurrentWeekEnd();

        const searchTerm = [
            ['FROM', 'office@parliamenthill.camden.sch.uk'],
            ['SUBJECT', 'Daily Digest Rewards'],
            ['SINCE', startOfWeek.toISOString().slice(0, 10)],
            ['BEFORE', endOfWeek.toISOString().slice(0, 10)]
        ];

        let pointsAwards = [];

        console.log(`search term: ${searchTerm}`);

        this.imap.search(searchTerm, (err, results) => {
            if (err) {
                console.error('Error searching emails:', err);
                return;
            }

            console.log(`matching emails count: ${results.length}`);

            // Fetch the email using the UID
            const fetchOptions = {
                bodies: [''],
                struct: true
            };

            console.log(`this.imap.search() returned results: ${JSON.stringify(results)}`);
            const fetch = this.imap.fetch(results, fetchOptions);

            fetch.on('message', (msg, seqno) => {
                msg.on('body', (stream, info) => {
                    console.log(`msg.on('body') has fired with message with seqno ${seqno} and info: ${JSON.stringify(info)}`);
                    simpleParser(stream, (err, parsed) => {
                        if (err) {
                            console.log(`Error parsing email: ${err}`);
                            return;
                        }
                        console.log(`parsed text: ${parsed.text}`);
                        pointsAwards.push(this.parseAwardEmail(parsed.text));
                        if (pointsAwards.length === results.length) {
                            console.log(`All emails fetched: ${JSON.stringify(pointsAwards)}`);
                            console.log(`Number emails fetched: ${pointsAwards.length}`);
                            this.sendSocketNotification('POINTS_AWARDED', this.summarisePoints(pointsAwards));
                        } else {
                            console.log('fetch.on(\'end\') has fired but expecting more messages');
                        }
                    });
                });
            });
        });
    },

    parseAwardEmail: function(rewardEmail) {
        // Regular expression pattern to match the reward message
        const rewardPattern = /\b(\w{3} \d{1,2} \d{4} \d{1,2}:\d{2}[AP]M) - P(\d+) \(Parli Point\) ([A-Za-z\s\/-]+)\n\nPlease\b/;

        // Extracting the reward parts
        const rewardMatch = rewardEmail.match(rewardPattern);

        // Assigning the extracted parts to named variables
        const date = rewardMatch ? rewardMatch[1] : null;
        const reward = rewardMatch ? parseInt(rewardMatch[2]) : null;
        let message = rewardMatch ? rewardMatch[3] : null;

        if (date === null || reward === null || message === null) {
            // this is not a Parli Point reward email, it's attendance or something else
            return {
                date: 'Jan 1 1970 9:00AM',
                reward: 0,
                message: `EMAIL IGNORED: ${rewardEmail}`
            };
        }

        message = message.replace(/\n/g, ' ');

        // Logging the extracted parts
        console.log("Date:", date);
        console.log("Reward:", reward);
        console.log("Message:", message);

        return {
            date,
            reward,
            message
        };
    },


    summarisePoints: function(pointsAwards) {
        let today = [];
        let today_total = 0;
        let this_week_total = 0;
        let last_week_total = 0;
        let self = this;

        pointsAwards.forEach(function(pointsAward) {
            let dateStatus = self.checkDateStatus(pointsAward.date);
            if (dateStatus.isToday) {
                today.push(pointsAward);
                today_total += pointsAward.reward;
            }
            if (dateStatus.isInCurrentWeek) {
                this_week_total += pointsAward.reward;
            }
            if (dateStatus.isInPreviousWeek) {
                last_week_total += pointsAward.reward;
            }
        });

        const data = {
            today,
            today_total,
            this_week_total,
            last_week_total
        };

        console.log(`presenting data: ${JSON.stringify(data)}`);

        // Format today's points
        const todayFormatted = data.today.map(entry => `P${entry.reward} - ${entry.message} `).join('\n');

        // Format the summary
        const summaryFormatted = `${todayFormatted}\nToday: £${data.today_total} This week: £${data.this_week_total} Last week: £${data.last_week_total}`;

        return summaryFormatted;
    },

    getCurrentWeekStart: function() {
        const today = new Date();
        const currentDayOfWeek = today.getDay();
        const currentWeekStart = new Date(today);
        currentWeekStart.setHours(0, 0, 0, 0); // Set hours, minutes, seconds, and milliseconds to 00:00:00
        currentWeekStart.setDate(today.getDate() - currentDayOfWeek + (currentDayOfWeek === 0 ? -6 : 1)); // Start from Monday
        return currentWeekStart;
    },

    getCurrentWeekEnd: function() {
        const currentWeekStart = this.getCurrentWeekStart();
        const currentWeekEnd = new Date(currentWeekStart);
        currentWeekEnd.setHours(23, 59, 59, 999); // Set hours, minutes, seconds, and milliseconds to 23:59:59
        currentWeekEnd.setDate(currentWeekStart.getDate() + 4); // End on Friday
        return currentWeekEnd;
    },

    getPreviousWeekStart: function() {
        const previousWeekStart = new Date(this.getCurrentWeekStart());
        previousWeekStart.setDate(previousWeekStart.getDate() - 7);
        previousWeekStart.setHours(0, 0, 0, 0); // Set hours, minutes, seconds, and milliseconds to 00:00:00
        return previousWeekStart;
    },

    getPreviousWeekEnd: function() {
        const previousWeekStart = this.getPreviousWeekStart();
        const previousWeekEnd = new Date(previousWeekStart);
        previousWeekEnd.setHours(23, 59, 59, 999); // Set hours, minutes, seconds, and milliseconds to 23:59:59
        previousWeekEnd.setDate(previousWeekEnd.getDate() + 4);
        return previousWeekEnd;
    },

    checkDateStatus: function(dateString) {
        function parseDateStringToDate(dateString) {
            const dateParts = dateString.split(" ");
            const month = dateParts[0];
            const day = parseInt(dateParts[1]);
            const year = parseInt(dateParts[2]);
            let time = dateParts[3];

            // Extract hour and minute from the time string
            const [hourMinute, amPM] = time.split(/(?=[AP]M)/);

            let [hour, minute] = hourMinute.split(":");
            hour = parseInt(hour);
            minute = parseInt(minute);

            // Adjust hour for PM
            if (amPM === "PM" && hour < 12) {
                hour += 12;
            }
            // Adjust hour for AM if it's 12 AM
            else if (amPM === "AM" && hour === 12) {
                hour = 0;
            }

            // Create a Date object
            const date = new Date(year, getMonthNumber(month), day, hour, minute);
            return date;
        }

        function getMonthNumber(monthName) {
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            return months.indexOf(monthName);
        }

        const date = parseDateStringToDate(dateString);
        console.log("Input Date:", date.toString());

        const today = new Date();
        const dayOfWeek = date.getDay();

        // Calculate the start and end dates of the current working week
        const currentWeekStart = this.getCurrentWeekStart();
        const currentWeekEnd = this.getCurrentWeekEnd();

        console.log("Current Week Start:", currentWeekStart.toString());
        console.log("Current Week End:", currentWeekEnd.toString());

        // Calculate the start and end dates of the previous working week
        const previousWeekStart = this.getPreviousWeekStart();
        const previousWeekEnd = this.getPreviousWeekEnd();

        console.log("Previous Week Start:", previousWeekStart.toString());
        console.log("Previous Week End:", previousWeekEnd.toString());

        // Check if the date falls into the current working week
        const isInCurrentWeek = date >= currentWeekStart && date <= currentWeekEnd;

        console.log("Is in Current Week:", isInCurrentWeek);

        // Check if the date falls into the previous working week
        const isInPreviousWeek = date >= previousWeekStart && date <= previousWeekEnd;

        console.log("Is in Previous Week:", isInPreviousWeek);

        // Check if the date is today and a week day
        const isToday = date.toDateString() === today.toDateString() && dayOfWeek >= 1 && dayOfWeek <= 5;

        console.log("Is Today:", isToday);

        return {
            isInCurrentWeek,
            isInPreviousWeek,
            isToday
        };
    }
});
