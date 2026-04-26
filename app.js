"use strict";

const Homey = require('homey');
const http = require('http');

class PlugwiseApp extends Homey.App {

  async onInit() {
    this.log('Plugwise Stretch App v1.1 gestart...');
    // Start de centrale timer (10 seconden)
    this._timer = setInterval(this.fetchData.bind(this), 10000);
    this.fetchData(); 
  }

  async fetchData() {
    const ip = this.homey.settings.get('ip_address');
    const stretchId = this.homey.settings.get('stretch_id');

    if (!ip || !stretchId) return;

    const auth = Buffer.from(`stretch:${stretchId}`).toString('base64');
    const options = {
      hostname: ip,
      path: '/core/appliances',
      headers: { 'Authorization': `Basic ${auth}` },
      timeout: 8000
    };

http.get(options, (res) => {
  this.log(`Fetch status: ${res.statusCode}`); // VOEG DEZE REGEL TOE
  let data = '';
  res.on('data', (chunk) => data += chunk);
res.on('end', () => {
        this.log(`--- Ontvangst Klaar ---`);
        this.log(`Totaal aantal bytes: ${data.length}`);
        
        // We versoepelen de check: als </appliances> erin staat, is het voor ons goed genoeg
        const xmlIsCompleet = data.includes('</appliances>') || data.includes('</plugwise>');

        if (res.statusCode === 200 && xmlIsCompleet) {
          this.log('Check geslaagd: XML is bruikbaar. Driver aanroepen...');
          const circleDriver = this.homey.drivers.getDriver('circle');
          if (circleDriver) {
             circleDriver.updateDevicesData(data);
          }
        } else {
          this.error(`Check mislukt. Status: ${res.statusCode}. XML bevat afsluit-tag: ${xmlIsCompleet}`);
          // Log even het allerlaatste stukje om te zien wat er écht binnenkwam
          this.log(`Einde van ontvangen data: ${data.slice(-30)}`);
        }
      });
}).on('error', (err) => this.error(`Polling Fout: ${err.message}`))
  }
}

module.exports = PlugwiseApp;