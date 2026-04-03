# Customizable pagos-extras section

Right now, the pagos-extras section is hardcoded in the HTML.
This feature request is to make it customizable via the Google Sheets API.

## New structure

### v3
Sheets will have a one column range with the values to use in this section.
If it is empty, the section will not be displayed.
The range is C:26 through C:40

The team uses an asterisk as a bullet point, and existing sheest already have that so we'll work with that.

Example:

*Tasas de embarque para excursiones desde puerto $5.500.- diaria,
*Ingreso al Parque Nacional Extranjeros: $20.000.- Nacionales $7.000.-,
*ascensos en Cerro Campanario adultos $22.000.- menores $15.000.-,
* ascensos en Cerro Catedral tarifa unica p/peaton: $ 36.000.-,
* ticket para pista ski tarifas (valor aproximado) $ 160.000.-,

Rules:
- When asterisks are present, strip them out.
- Asterisk followed by a space: strip both (asterisk and space)
- If no asterisk is present, use the cell value as is.

## Backwards compatibility (v1 and v2)

In order to support previous versions of the spreadsheets, we will keep the hardcoded values in the HTML for v1 and v2. (section id="pagos-extras")
Any sheet data that is not v3, is expected to display the hardcoded values in the HTML instead of the values from the range as explained above.

## Sample data

test-data/response-v3-dev.json already contains the added range with values.

