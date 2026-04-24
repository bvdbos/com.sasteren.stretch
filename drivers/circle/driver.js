"use strict";

const Homey = require('homey');
const http = require('http');

class CircleDriver extends Homey.Driver {

  async onInit() {
    this.log('Circle Driver has been initialized');
  }

  // NIEUW: Deze handler zorgt ervoor dat de selectie uit de lijst goed wordt verwerkt
async onPair(session) {
    this.log('[Pairing] Pairing sessie gestart');

    // Deze handler stuurt de lijst naar de telefoon
    session.setHandler('list_devices', async () => {
      this.log('[Pairing] Lijst opvragen voor de wizard...');
      
      // Roep hier je functie aan die de XML ophaalt en parst
      const devices = await this.onPairListDevices();
      
      this.log(`[Pairing] We sturen ${devices.length} apparaten naar de wizard.`);
      
      // Nu sturen we de ECHTE lijst met apparaten terug naar de telefoon
      return devices;
    });

    // Deze handler ontvangt de vinkjes van de gebruiker (voor meerdere devices)
    session.setHandler('add_devices', async (data) => {
      this.log('[Pairing] Gebruiker heeft deze apparaten aangevinkt:', data);
      return data;
    });
  }

  async onPairListDevices() {
    this.log('[Pairing] onPairListDevices aangeroepen...');

    const ip = this.homey.settings.get('ip_address');
    const stretchId = this.homey.settings.get('stretch_id');
    
    if (!ip || !stretchId) {
      this.error('[Pairing] Fout: IP of Stretch ID ontbreekt.');
      throw new Error('Configureer eerst het IP-adres en de Stretch ID in de app-instellingen.');
    }
    
    const auth = Buffer.from(`stretch:${stretchId}`).toString('base64');

    return new Promise((resolve, reject) => {
      const options = {
        host: ip,
        path: '/core/appliances',
        method: 'GET',
        headers: { 'Authorization': `Basic ${auth}` },
        timeout: 10000
      };

      http.get(options, (res) => {
        let xml = '';
        res.on('data', (chunk) => { xml += chunk; });
        res.on('end', () => {
          const devices = [];
          const applianceBlocks = xml.split('<appliance ');
          applianceBlocks.shift();

          applianceBlocks.forEach(block => {
            const nameMatch = block.match(/<name>(.*?)<\/name>/);
            const idMatch = block.match(/id=["'](.*?)["']/i); // Verbeterde regex

            if (nameMatch && idMatch) {
              const name = nameMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
              const id = idMatch[1].trim();

devices.push({
  name: name, // Haal + " (Test)" hier weg
  data: { 
    id: `${id}` // We gebruiken 'pws_' als prefix om ID-conflicten te voorkomen
  }
});
            }
          });

          this.log(`[Pairing] ${devices.length} apparaten gevonden.`);
          resolve(devices);
        });
      }).on('error', (err) => {
        this.error('HTTP Error:', err);
        reject(err);
      });
    });
  }
}

module.exports = CircleDriver;