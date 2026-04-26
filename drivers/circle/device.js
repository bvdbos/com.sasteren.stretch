"use strict";

const Homey = require('homey');
const http = require('http');

class CircleDevice extends Homey.Device {

  async onInit() {
    this.log(`Circle Device ${this.getName()} is geïnitialiseerd (v1.1)`);

    // Luister naar de aan/uit knop in de Homey App
    this.registerCapabilityListener('onoff', async (value) => {
      const ip = this.homey.settings.get('ip_address');
      const stretchId = this.homey.settings.get('stretch_id');
      const deviceId = this.getData().id;

      if (!stretchId) throw new Error('Stretch ID ontbreekt');

      const auth = Buffer.from(`stretch:${stretchId}`).toString('base64');
      const xmlBody = `<relay><state>${value ? 'on' : 'off'}</state></relay>`;

      const options = {
        host: ip,
        path: `/core/appliances;id=${deviceId}/relay`,
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'text/xml',
          'Content-Length': Buffer.byteLength(xmlBody)
        }
      };

      return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (value === false) {
              this.setCapabilityValue('measure_power', 0).catch(this.error);
            }
            resolve();
          } else {
            reject(new Error(`Stretch gaf status ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.write(xmlBody);
        req.end();
      });
    });
  }

  // Deze functie wordt aangeroepen vanuit de Driver
onDataUpdate(myBlock) {
  // 1. Status (on/off) uitlezen uit de XML van de Stretch
  const stateMatch = myBlock.match(/<state>(on|off)<\/state>/);
  const xmlIsOn = stateMatch ? (stateMatch[1] === 'on') : null;

  // 2. Wattage (W) uitlezen uit de XML
  const measureMatch = myBlock.match(/<type>electricity_consumed<\/type>\s*<unit>W<\/unit>[\s\S]*?<measurement[^>]*?>([\d.]+)<\/measurement>/);

  if (measureMatch) {
    let power = parseFloat(measureMatch[1]);

    // De Slimme Check:
    // We dwingen 0W alleen af als:
    // Homey zegt dat hij UIT staat EN de XML van de Stretch ook zegt dat hij UIT staat.
    // Dit voorkomt dat 'ijling' (oude verbruikscijfers) de 0W overschrijft.
    if (this.getCapabilityValue('onoff') === false && xmlIsOn === false) {
      if (power > 0) {
        // this.log('IJling gedetecteerd: Stretch zegt UIT maar stuurt nog Wattage. Correctie naar 0W.');
        power = 0;
      }
    }

    if (!isNaN(power)) {
      this.setCapabilityValue('measure_power', power).catch(this.error);
    }
  }

  // 3. Update de aan/uit status in Homey met de werkelijke status van de Stretch
  if (xmlIsOn !== null) {
    this.setCapabilityValue('onoff', xmlIsOn).catch(this.error);
  }
}

} // <--- Deze sloot waarschijnlijk niet goed af

module.exports = CircleDevice;