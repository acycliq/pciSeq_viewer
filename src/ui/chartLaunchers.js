/**
 * Lights a chart's card in the drawer while its panel is open, so what is open
 * shows at a glance. The panels say when they open and close (widgetBase.js).
 */
const CARD_OF = {
    cellClassDistributionWidget: 'classesByZBtn',
    cellClassPercentageWidget: 'classPercentageBtn',
    expressionHistogramWidget: 'expressionHistogramBtn',
    geneDistributionWidget: 'geneDistributionBtn',
    rhoBarWidget: 'misreadRhoBtn',
    stackedBarWidget: 'misreadStackedBtn',
    perPlaneWidget: 'misreadPerPlaneBtn',
};

window.addEventListener('widget-visibility', (e) => {
    const card = document.getElementById(CARD_OF[e.detail.id]);
    if (card) card.classList.toggle('is-open', e.detail.visible);
});
