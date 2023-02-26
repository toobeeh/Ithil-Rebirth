/**
 Schema Generated with mysql-schema-ts 1.9.0
*/

/**
 * Exposes all fields present in AccessTokens as a typescript
 * interface.
 */
export interface AccessTokens {
    Login: number
    AccessToken: string
    /**  Defaults to: current_timestamp(). */
    CreatedAt: Date
  }
  
  /**
   * Exposes the same fields as AccessTokens,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface AccessTokensWithDefaults {
    Login: number
    AccessToken: string
    /**  Defaults to: current_timestamp(). */
    CreatedAt?: Date
  }
  /**
   * Exposes all fields present in BoostSplits as a typescript
   * interface.
   */
  export interface BoostSplits {
    ID: number
    Name: string
    Description: string
    Date: string
    Value: number
  }
  
  /**
   * Exposes the same fields as BoostSplits,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface BoostSplitsWithDefaults {
    ID: number
    Name: string
    Description: string
    Date: string
    Value: number
  }
  /**
   * Exposes all fields present in BubbleTraces as a typescript
   * interface.
   */
  export interface BubbleTraces {
    Date: string
    Login: number
    Bubbles: number
    ID: number
  }
  
  /**
   * Exposes the same fields as BubbleTraces,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface BubbleTracesWithDefaults {
    Date: string
    Login: number
    Bubbles: number
    ID: number
  }
  /**
   * Exposes all fields present in DropBoosts as a typescript
   * interface.
   */
  export interface DropBoosts {
    Login: number
    StartUTCS: string
    DurationS: number
    Factor: string
    /**  Defaults to: 0. */
    CooldownBonusS: number
  }
  
  /**
   * Exposes the same fields as DropBoosts,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface DropBoostsWithDefaults {
    Login: number
    StartUTCS: string
    DurationS: number
    Factor: string
    /**  Defaults to: 0. */
    CooldownBonusS?: number
  }
  /**
   * Exposes all fields present in EventCredits as a typescript
   * interface.
   */
  export interface EventCredits {
    Login: number
    EventDropID: number
    /**  Defaults to: 0. */
    Credit: number
  }
  
  /**
   * Exposes the same fields as EventCredits,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface EventCreditsWithDefaults {
    Login: number
    EventDropID: number
    /**  Defaults to: 0. */
    Credit?: number
  }
  /**
   * Exposes all fields present in EventDrops as a typescript
   * interface.
   */
  export interface EventDrops {
    EventDropID: number
    EventID: number
    URL: string
    Name: string
  }
  
  /**
   * Exposes the same fields as EventDrops,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface EventDropsWithDefaults {
    EventDropID: number
    EventID: number
    URL: string
    Name: string
  }
  /**
   * Exposes all fields present in Events as a typescript
   * interface.
   */
  export interface Events {
    EventID: number
    EventName: string
    DayLength: number
    Description: string
    ValidFrom: string
  }
  
  /**
   * Exposes the same fields as Events,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface EventsWithDefaults {
    EventID: number
    EventName: string
    DayLength: number
    Description: string
    ValidFrom: string
  }
  /**
   * Exposes all fields present in GuildLobbies as a typescript
   * interface.
   */
  export interface GuildLobbies {
    GuildID: string
    Lobbies: string
  }
  
  /**
   * Exposes the same fields as GuildLobbies,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface GuildLobbiesWithDefaults {
    GuildID: string
    Lobbies: string
  }
  /**
   * Exposes all fields present in GuildSettings as a typescript
   * interface.
   */
  export interface GuildSettings {
    GuildID: string
    Settings: string
  }
  
  /**
   * Exposes the same fields as GuildSettings,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface GuildSettingsWithDefaults {
    GuildID: string
    Settings: string
  }
  /**
   * Exposes all fields present in Lobbies as a typescript
   * interface.
   */
  export interface Lobbies {
    LobbyID: string
    Lobby: string
  }
  
  /**
   * Exposes the same fields as Lobbies,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface LobbiesWithDefaults {
    LobbyID: string
    Lobby: string
  }
  /**
   * Exposes all fields present in Members as a typescript
   * interface.
   */
  export interface Members {
    Login: number
    Member: string
    /**  Defaults to: 0. */
    Bubbles: number
    /**  Defaults to: ''. */
    Sprites: string
    /**  Defaults to: 0. */
    Drops: number
    /**  Defaults to: 0. */
    Flag: number
    /**  Defaults to: NULL. */
    Emoji?: string | null
    /**  Defaults to: NULL. */
    Patronize?: string | null
    /**  Defaults to: NULL. */
    Customcard?: string | null
    /**  Defaults to: ''. */
    Scenes?: string | null
    /**  Defaults to: ''. */
    Streamcode: string
    /**  Defaults to: NULL. */
    RainbowSprites?: string | null
  }
  
  /**
   * Exposes the same fields as Members,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface MembersWithDefaults {
    Login: number
    Member: string
    /**  Defaults to: 0. */
    Bubbles?: number
    /**  Defaults to: ''. */
    Sprites?: string
    /**  Defaults to: 0. */
    Drops?: number
    /**  Defaults to: 0. */
    Flag?: number
    /**  Defaults to: NULL. */
    Emoji?: string | null
    /**  Defaults to: NULL. */
    Patronize?: string | null
    /**  Defaults to: NULL. */
    Customcard?: string | null
    /**  Defaults to: ''. */
    Scenes?: string | null
    /**  Defaults to: ''. */
    Streamcode?: string
    /**  Defaults to: NULL. */
    RainbowSprites?: string | null
  }
  /**
   * Exposes all fields present in NextDrop as a typescript
   * interface.
   */
  export interface NextDrop {
    DropID: string
    CaughtLobbyKey: string
    CaughtLobbyPlayerID: string
    ValidFrom: string
    EventDropID: number
    /**  Defaults to: 0. */
    LeagueWeight: number
  }
  
  /**
   * Exposes the same fields as NextDrop,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface NextDropWithDefaults {
    DropID: string
    CaughtLobbyKey: string
    CaughtLobbyPlayerID: string
    ValidFrom: string
    EventDropID: number
    /**  Defaults to: 0. */
    LeagueWeight?: number
  }
  /**
   * Exposes all fields present in OnlineItems as a typescript
   * interface.
   */
  export interface OnlineItems {
    ItemType: string
    Slot: number
    ItemID: number
    LobbyKey: string
    LobbyPlayerID: number
    Date: number
  }
  
  /**
   * Exposes the same fields as OnlineItems,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface OnlineItemsWithDefaults {
    ItemType: string
    Slot: number
    ItemID: number
    LobbyKey: string
    LobbyPlayerID: number
    Date: number
  }
  /**
   * Exposes all fields present in OnlineSprites as a typescript
   * interface.
   */
  export interface OnlineSprites {
    LobbyKey: string
    LobbyPlayerID: number
    Sprite: number
    Date: string
    Slot: number
    ID: string
  }
  
  /**
   * Exposes the same fields as OnlineSprites,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface OnlineSpritesWithDefaults {
    LobbyKey: string
    LobbyPlayerID: number
    Sprite: number
    Date: string
    Slot: number
    ID: string
  }
  /**
   * Exposes all fields present in Palantiri as a typescript
   * interface.
   */
  export interface Palantiri {
    Token: string
    Palantir: string
  }
  
  /**
   * Exposes the same fields as Palantiri,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface PalantiriWithDefaults {
    Token: string
    Palantir: string
  }
  /**
   * Exposes all fields present in PalantiriNightly as a typescript
   * interface.
   */
  export interface PalantiriNightly {
    Token: string
    Palantir: string
  }
  
  /**
   * Exposes the same fields as PalantiriNightly,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface PalantiriNightlyWithDefaults {
    Token: string
    Palantir: string
  }
  /**
   * Exposes all fields present in PastDrops as a typescript
   * interface.
   */
  export interface PastDrops {
    DropID: number
    CaughtLobbyKey: string
    CaughtLobbyPlayerID: string
    ValidFrom: string
    EventDropID: number
    /**  Defaults to: 0. */
    LeagueWeight: number
  }
  
  /**
   * Exposes the same fields as PastDrops,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface PastDropsWithDefaults {
    DropID: number
    CaughtLobbyKey: string
    CaughtLobbyPlayerID: string
    ValidFrom: string
    EventDropID: number
    /**  Defaults to: 0. */
    LeagueWeight?: number
  }
  /**
   * Exposes all fields present in Reports as a typescript
   * interface.
   */
  export interface Reports {
    LobbyID: string
    ObserveToken: number
    Report: string
    Date: string
  }
  
  /**
   * Exposes the same fields as Reports,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface ReportsWithDefaults {
    LobbyID: string
    ObserveToken: number
    Report: string
    Date: string
  }
  /**
   * Exposes all fields present in Scenes as a typescript
   * interface.
   */
  export interface Scenes {
    ID: number
    Name: string
    Artist: string
    Color: string
    URL: string
    /**  Defaults to: NULL. */
    GuessedColor?: string | null
    /**  Defaults to: 0. */
    EventID: number
    /**  Defaults to: 0. */
    Exclusive: number
  }
  
  /**
   * Exposes the same fields as Scenes,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface ScenesWithDefaults {
    ID: number
    Name: string
    Artist: string
    Color: string
    URL: string
    /**  Defaults to: NULL. */
    GuessedColor?: string | null
    /**  Defaults to: 0. */
    EventID?: number
    /**  Defaults to: 0. */
    Exclusive?: number
  }
  /**
   * Exposes all fields present in SplitCredits as a typescript
   * interface.
   */
  export interface SplitCredits {
    Login: number
    Split: number
    RewardDate: string
    /**  Defaults to: ''. */
    Comment: string
    /**  Defaults to: -1. */
    ValueOverride: number
  }
  
  /**
   * Exposes the same fields as SplitCredits,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface SplitCreditsWithDefaults {
    Login: number
    Split: number
    RewardDate: string
    /**  Defaults to: ''. */
    Comment?: string
    /**  Defaults to: -1. */
    ValueOverride?: number
  }
  /**
   * Exposes all fields present in SpriteProfiles as a typescript
   * interface.
   */
  export interface SpriteProfiles {
    Login: number
    Name: string
    Combo: string
    RainbowSprites: string
    Scene: string
  }
  
  /**
   * Exposes the same fields as SpriteProfiles,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface SpriteProfilesWithDefaults {
    Login: number
    Name: string
    Combo: string
    RainbowSprites: string
    Scene: string
  }
  /**
   * Exposes all fields present in Sprites as a typescript
   * interface.
   */
  export interface Sprites {
    ID: number
    Name: string
    URL: string
    Cost: number
    /**  Defaults to: 0. */
    Special: number
    /**  Defaults to: 0. */
    EventDropID: number
    /**  Defaults to: ''. */
    Artist?: string | null
    /**  Defaults to: 0. */
    Rainbow: number
  }
  
  /**
   * Exposes the same fields as Sprites,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface SpritesWithDefaults {
    ID: number
    Name: string
    URL: string
    Cost: number
    /**  Defaults to: 0. */
    Special?: number
    /**  Defaults to: 0. */
    EventDropID?: number
    /**  Defaults to: ''. */
    Artist?: string | null
    /**  Defaults to: 0. */
    Rainbow?: number
  }
  /**
   * Exposes all fields present in Status as a typescript
   * interface.
   */
  export interface Status {
    SessionID: string
    Status: string
    Date: string
  }
  
  /**
   * Exposes the same fields as Status,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface StatusWithDefaults {
    SessionID: string
    Status: string
    Date: string
  }
  /**
   * Exposes all fields present in Themes as a typescript
   * interface.
   */
  export interface Themes {
    Ticket: string
    Theme: string
    ThumbnailLanding: string
    /**  Defaults to: NULL. */
    ThumbnailGame?: string | null
    Name: string
    Description: string
    Author: string
  }
  
  /**
   * Exposes the same fields as Themes,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface ThemesWithDefaults {
    Ticket: string
    Theme: string
    ThumbnailLanding: string
    /**  Defaults to: NULL. */
    ThumbnailGame?: string | null
    Name: string
    Description: string
    Author: string
  }
  /**
   * Exposes all fields present in Webhooks as a typescript
   * interface.
   */
  export interface Webhooks {
    ServerID: string
    Name: string
    WebhookURL: string
  }
  
  /**
   * Exposes the same fields as Webhooks,
   * but makes every field containing a DEFAULT value optional.
   *
   * This is especially useful when generating inserts, as you
   * should be able to omit these fields if you'd like
   */
  export interface WebhooksWithDefaults {
    ServerID: string
    Name: string
    WebhookURL: string
  }