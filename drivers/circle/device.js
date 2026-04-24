"use strict";

const Homey = require('homey');
const http = require('http');

class CircleDevice extends Homey.Device {

async onInit() {
    this.log(`Circle Device ${this.getName()} is geïnitialiseerd`);

    // Luister naar de aan/uit knop in de Homey App
    this.registerCapabilityListener('onoff', async (value) => {
      
      // We halen eerst de instellingen op. 
      // Als de gebruiker niets heeft ingevuld, vallen we terug op jouw defaults (optioneel)
      const ip = this.homey.settings.get('ip_address') || '10.0.4.187';
      const stretchId = this.homey.settings.get('stretch_id') || ''; 

      this.log(`IP Check: ${ip}, StretchID Check: ${stretchId}`);

      // Als er echt geen ID is, stoppen we
      if (!stretchId) {
        throw new Error('Stretch ID is niet geconfigureerd in de App instellingen');
      }

      const auth = Buffer.from(`stretch:${stretchId}`).toString('base64');
      const deviceId = this.getData().id;
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

      this.log(`Verzoek naar: http://${ip}${options.path} met body: ${xmlBody}`);

      return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          this.log(`Statuscode van Stretch: ${res.statusCode}`);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (value === false) {
              this.log('Uitschakelen gelukt, verbruik geforceerd naar 0W');
              this.setCapabilityValue('measure_power', 0).catch(this.error);
            }              
            resolve();
          } else {
            reject(new Error(`Stretch gaf status ${res.statusCode}`));
          }
        });

        req.on('error', (err) => {
          this.error('HTTP Request fout:', err);
          reject(err);
        });

        req.write(xmlBody);
        req.end();
      });
    });

    // Start een timer om het vermogen op te halen (polling)
    this.startPolling();
  }

async startPolling() {
const ip = this.homey.settings.get('ip_address') || '10.0.4.187';
const stretchId = this.homey.settings.get('stretch_id');
    const auth = Buffer.from(`stretch:${stretchId}`).toString('base64');
    const deviceId = this.getData().id;

    this.log(`Polling gestart voor ${this.getName()}`);

    this.homey.setInterval(async () => {
      const options = {
        host: ip,
        path: `/core/appliances;id=${deviceId}`, // Vraag data van specifiek apparaat
        method: 'GET',
        headers: { 'Authorization': `Basic ${auth}` },
        timeout: 5000
      };

      http.get(options, (res) => {
        let xml = '';
        res.on('data', chunk => xml += chunk);
res.on('end', async () => {
          // We zoeken specifiek naar het point_log blok van de huidige consumptie in Watt
          // De Stretch zet de meest actuele waarde vaak in het blok waar 'electricity_consumed' 
          // direct gevolgd wordt door '<unit>W</unit>'
          const regex = /<point_log id='.*?'>\s*<updated_date>.*?<\/updated_date>\s*<type>electricity_consumed<\/type>\s*<unit>W<\/unit>.*?<measurement.*?>(.*?)<\/measurement>/gs;
          
          let match;
          let found = false;

          // We gebruiken een loop voor het geval er meerdere zijn, we willen de laatste match
          while ((match = regex.exec(xml)) !== null) {
            const power = parseFloat(match[1]);
            this.log(`[Polling] Gevonden waarde in XML: ${power}W`);
            
            // Alleen updaten als het een geldig getal is
            if (!isNaN(power)) {
              await this.setCapabilityValue('measure_power', power).catch(this.error);
              found = true;
            }
          }

          if (!found) {
            this.log('[Polling] Kon geen actueel Wattage vinden in de XML. Staat de Circle wel aan?');
          }

          // Update Relay Status
          const stateMatch = xml.match(/<actuators>.*?<state>(.*?)<\/state>/s);
          if (stateMatch && stateMatch[1]) {
            this.setCapabilityValue('onoff', stateMatch[1] === 'on').catch(this.error);
          }
        });
      }).on('error', err => this.error('Polling fout:', err));
    }, 10000); // Elke 10 seconden
  }
}

module.exports = CircleDevice;