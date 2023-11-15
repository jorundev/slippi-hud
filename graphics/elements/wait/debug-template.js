import { html, css } from 'lit'
import { repeat } from 'lit/directives/repeat.js'

import '@vaadin/vaadin-ordered-layout/vaadin-vertical-layout'
import '@vaadin/vaadin-ordered-layout/vaadin-horizontal-layout'

export const template = function () {
    if (!this.ready) return html``

    return html`
      <div style="font-weight: bold;">GENERAL DATA</div>
      <div>
        this.playerData[0].player.country "${this.playerData[0].player.country}"
      </div>
      <div>
        <img
          alt=""
          src="./img/flags/${this.playerData[0].player.country}.svg"
		  style="width: 300px;"
        />
      </div>
    `;
}

export const style = function () {
    return css`
        :host {
        }
    `
}
