"use strict";

const Homey = require('homey');
const http = require('http');

class PlugwiseApp extends Homey.App {

  async onInit() {
    this.log('--- Plugwise Stretch App Initialiseren (com.sasteren.stretch) ---');
    
    // Start de verbindingstest
    await this.testConnection();
  }

  /**
   * Test de verbinding met de Stretch en haal de XML op
   */
  async testConnection() {
 const ip = this.homey.settings.get('ip_address');
  const id = this.homey.settings.get('stretch_id');

  if (!ip || !id) {
    this.log('[App] TestConnection overgeslagen: Geen instellingen geconfigureerd.');
    return;
  }

    this.log(`[Check] Poging tot verbinding: http://${ip} met ID: ${id}`);

    const auth = Buffer.from(`stretch:${id}`).toString('base64');

    const options = {
      host: ip,
      path: '/core/modules', // Je kunt dit wijzigen naar '/core/modules' als het te zwaar blijft
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Connection': 'close'
      },
      timeout: 20000
    };

    const req = http.request(options, (res) => {
      let data = '';

      this.log(`[Check] Status ontvangen: ${res.statusCode}`);

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`[Check] Ontvangst klaar. Totaal: ${data.length} tekens.`);

        if (!data.includes('</plugwise>')) {
          console.log(`[Check] WAARSCHUWING: XML is incompleet, sluit-tag handmatig toegevoegd.`);
          data += '</plugwise>';
        }

        // Roep de parser aan om de Circles te vinden
        this.parseCircles(data);
      });
    });

    req.on('error', (err) => {
      this.error(`[Check] HTTP Fout: ${err.message}`);
    });

    req.end();
  }

  /**
   * Analyseert de XML en zoekt naar Circle modules
   */
parseCircles(xmlString) {
    this.log('--- Analyseren van XML data ---');

    // We zoeken naar alles tussen <module ...> en </module>
    // De 's' flag zorgt dat hij over meerdere regels zoekt
    const moduleRegex = /<module\b[^>]*>([\s\S]*?)<\/module>/g;
    let match;
    let foundCount = 0;

while ((match = moduleRegex.exec(xmlString)) !== null) {
      const fullTag = match[0]; // De hele <module id="..."> tag inclusief inhoud
      const block = match[1];   // Alleen de inhoud

      // Verbeterde ID match: we zoeken in de start-tag naar id="..."
      const idMatch = fullTag.match(/id=["']([a-f0-9]+)["']/i);
      
      if (block.includes('<vendor_model>NR</vendor_model>')) {
        const id = idMatch ? idMatch[1] : 'Onbekend ID';
        const macMatch = block.match(/<mac_address>(.*?)<\/mac_address>/);
        const mac = macMatch ? macMatch[1] : '???';

        this.log(`[Gevonden] Circle ID: ${id} | MAC: ${mac}`);
        foundCount++;
      }
    }

    if (foundCount === 0) {
      this.log('[!] Geen Circles gevonden. Is de XML-tekst wel compleet binnengekomen in de functie?');
      this.log('Eerste 200 tekens van XML:', xmlString.substring(0, 200));
    } else {
      this.log(`--- Succes: ${foundCount} Circles geïdentificeerd ---`);
    }
  }

}

module.exports = PlugwiseApp;