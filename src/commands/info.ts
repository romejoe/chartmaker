/**
 * 'info' command handler.
 * Displays current settings and active chart date.
 */

import type { Settings } from "../types.ts";
import { getBestChartDate } from "../chartdates.ts";
import { getAllChartNames } from "../config.ts";

export function showInfo(settings: Settings, appDir: string): void {
  const { chartDate, expireDate } = getBestChartDate(appDir);
  const { areas, full } = getAllChartNames(settings);

  console.log(`
Chartmaker - FAA Aviation Chart Generator
──────────────────────────────────────────

Chart Date:       ${chartDate}
Expires:          ${expireDate}

Default Settings:
  Zoom Range:     ${settings.defaults.zoomRange}
  Tile Format:    ${settings.defaults.tileFormat}
  Quality:        ${settings.defaults.quality}
  Output Format:  ${settings.defaults.outputFormat}
  Output Dir:     ${settings.defaults.outputDir}
  Grayscale:      ${settings.defaults.grayscale}
  Add Overviews:  ${settings.defaults.addOverviews}
  Blend Pixels:   ${settings.defaults.blendPixels}
  Clean Workarea: ${settings.defaults.cleanWorkarea}
  Layer Type:     ${settings.defaults.layerType}
  DB Extension:   ${settings.defaults.dbExtension}

Available Charts:
  Full Types:     ${full.length} (${full.map(n => n.replaceAll("_", " ")).join(", ")})
  Area Charts:    ${areas.length}

FAA Download URLs:
  VFR:            ${settings.urls.vfr}
  VFR Individual: ${settings.urls.vfrIndividual}
  IFR:            ${settings.urls.ifr}
  Wall Planning:  ${settings.urls.wallPlanning}
`);
}
