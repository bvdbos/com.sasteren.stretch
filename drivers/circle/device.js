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
    // 1. Wattage (W)
    const regex = /<type>electricity_consumed<\/type>\s*<unit>W<\/unit>[\s\S]*?<measurement[^>]*?>([\d.]+)<\/measurement>/;
    const match = myBlock.match(regex);
    
    if (match) {
      const power = parseFloat(match[1]);
      if (!isNaN(power)) {
        this.setCapabilityValue('measure_power', power).catch(this.error);
      }
    }

    // 2. Status (Aan/Uit)
    const stateMatch = myBlock.match(/<state>(on|off)<\/state>/);
    if (stateMatch) {
      this.setCapabilityValue('onoff', stateMatch[1] === 'on').catch(this.error);
    }
  }

} // <--- Deze sloot waarschijnlijk niet goed af

module.exports = CircleDevice;