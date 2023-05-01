import i18n from "@/i18n";

// To get actual logo path of the bot, we need to use Webpack 4's require.context()
// to get the context of the logo files, and then use the context to get the actual
// path of the logo file.
const botLogoContext = require.context(
  "../assets/bots/",
  false,
  /\.(png|jpg|jpeg|svg)$/
);

export default class Bot {
  static _instance;
  static _logoPackedPaths = null;
  static _isAvailable = false;

  static _brandId = "bot"; // Brand id of the bot, should be unique. Used in i18n.
  static _model = ""; // Model of the bot (eg. "text-davinci-002-render-sha")
  static _logoFilename = "default-logo.svg"; // Place it in assets/bots/
  static _loginUrl = "undefined";
  static _userAgent = ""; // Empty string means using the default user agent
  static _lock = null; // AsyncLock for network requests. `new AsyncLock()` in the subclass as needed.
  static _settingsComponent = ""; // Vue component filename for settings

  constructor() {
    // Compute the logo paths after packing by Webpack 4
    if (!this.constructor._logoPackedPaths) {
      this.constructor._logoPackedPaths = botLogoContext
        .keys()
        .reduce((logos, logoPath) => {
          logos[logoPath.replace("./", "")] = botLogoContext(logoPath);
          return logos;
        }, {});
    }

    if (this.constructor._instance) {
      return this.constructor._instance;
    }
    this.constructor._instance = this;
  }

  static getInstance() {
    return new this();
  }

  getLogo() {
    return this.constructor._logoPackedPaths[this.constructor._logoFilename];
  }

  getBrandName() {
    const c = this.constructor;
    return i18n.global.t(`${c._brandId}.name`);
  }

  getModelName() {
    const c = this.constructor;
    return c._model ? i18n.global.t(`${c._brandId}.${c._model}`) : "";
  }

  getFullname() {
    if (this.getModelName())
      return `${this.getBrandName()} (${this.getModelName()})`;
    else return this.getBrandName();
  }

  getLoginUrl() {
    return this.constructor._loginUrl;
  }

  getUserAgent() {
    return this.constructor._userAgent;
  }

  async getSettingsComponent() {
    let component;

    if (this.constructor._settingsComponent) {
      component = await import(
        `@/components/BotSettings/${this.constructor._settingsComponent}`
      );
    } else {
      let currentClass = this.constructor;
      let parentClass = Object.getPrototypeOf(currentClass);
      while (parentClass && parentClass.name !== "Bot") {
        currentClass = parentClass;
        parentClass = Object.getPrototypeOf(currentClass);
      }
      const componentName = currentClass.name + "Settings";
      component = await import(`@/components/BotSettings/${componentName}.vue`);
    }

    return component.default;
  }

  isAvailable() {
    return this.constructor._isAvailable;
  }

  /**
   * Acquire a lock for the given key and call lockedFn() when the lock is acquired.
   * If the lock is not available, call onLockUnavailable() and then try to acquire
   * the lock again.
   * @param {string} key
   * @param {function} lockedFn
   * @param {function} onLockUnavailable
   */
  async acquireLock(key, lockedFn, onLockUnavailable) {
    const self = this;
    await this.constructor._lock.acquire(
      key,
      lockedFn,
      async function (err, ret) {
        if (err) {
          // The lock is not available
          onLockUnavailable();
          await self.constructor._lock.acquire(key, lockedFn); // Wait forever
        }
        return ret;
      },
      { timeout: 1 } // Wait for only 1ms. Don't use 0 here.
    );
  }

  /**
   * Subclass should implement this method, not sendPrompt().
   * Send a prompt to the bot and call onResponse(response, callbackParam)
   * when the response is ready.
   * @param {string} prompt
   * @param {function} onUpdateResponse params: response, callbackParam, done
   * @param {object} callbackParam - Just pass it to onUpdateResponse() as is
   */
  async _sendPrompt(prompt, onUpdateResponse, callbackParam) {
    return new Promise((resolve, reject) => {
      onUpdateResponse(
        i18n.global.t("bot.notImplemented"),
        callbackParam,
        true
      );
      resolve();
      reject();
    });
  }

  async sendPrompt(prompt, onUpdateResponse, callbackParam) {
    // If not logged in, handle the error
    if (!this.isAvailable()) {
      onUpdateResponse(
        i18n.global.t("bot.notAvailable", { botName: this.getFullname() }),
        callbackParam,
        true
      );
      return;
    }

    if (!this.constructor._lock) {
      await this._sendPrompt(prompt, onUpdateResponse, callbackParam);
    } else {
      await this.acquireLock(
        this.constructor._brandId,
        async () => {
          await this._sendPrompt(prompt, onUpdateResponse, callbackParam);
        },
        () => {
          onUpdateResponse(
            i18n.global.t("bot.waiting", { botName: this.getBrandName() }),
            callbackParam,
            false
          );
        }
      );
    }
  }

  /**
   * Subclass must implement this method.
   * Check if the bot is logged in, settings are correct, etc.
   * @returns {boolean} - true if the bot is available, false otherwise.
   * @sideeffect - Set this.constructor._isAvailable
   */
  async checkAvailability() {
    return false;
  }

  /**
   * Subclass should implement this method if the bot supports conversation.
   * The conversation structure is defined by the subclass.
   * @param null
   * @returns {any} - Conversation structure. null if not supported.
   */
  async createConversation() {
    return null;
  }
}
