const { ObjectId } = require("mongodb");
const UserModel = require("../../Models/User/User.model");
const SportsSettingModel = require("../../Models/Sports/SportsSetting.model");
const GameSportsSettingLogModel = require("../../Models/Sports/GameSportsSettingLog.model");
const { returnResponse } = require("../../Helpers/ResponseMapper");
const { InsertUserActivity } = require("../../Helpers/StatementHelper");
const { client } = require("../../Helpers/RedisHelper");
const { UserTypes } = require("../../Common/Constants");
const { dateWhereCond } = require("../../Helpers/CommonHelper");

const SPORTS_FLAGS = [
  "isCricket",
  "isIntCasino",
  "isMatka",
  "isPolitics",
  "isCasino",
  "isFootball",
  "isTennis",
  "isHourse",
  "isGreyHound",
  "isKabbadi",
  "isToss",
  "isFancy",
  "isFigure",
  "isMatchOdds",
  "isEvenOdds",
  "isCupWiner",
  "isUnderOverGoal",
  "isSoccerMatchOdds",
];

const MAX_AMOUNT_FIELDS = [
  "soccerMaxAmount",
  "tennisMaxAmount",
  "cricketMaxAmount",
  "greyhoundMaxAmount",
  "hourseMaxAmount",
  "racesMaxAmount",
  "bookmakerMaxAmount",
  "fancyMaxAmount",
  "casinoMaxAmount",
];

const MAX_PROFIT_LOSS_FIELDS = [
  "bookmakerMaximunProfitLoss",
  "fancyMaximunProfitLoss",
  "betfairMaximunProfitLoss",
  "tennisMaximunProfitLoss",
  "soccerMaximunProfitLoss",
  "racingMaximunProfitLoss",
];

// seconds for which the bet api is held
const BET_DELAY_FIELDS = [
  "bookmakerBetDelay",
  "fancyBetDelay",
  "betfairBetDelay",
  "tennisBetDelay",
  "soccerBetDelay",
  "racingBetDelay",
];
const MAX_BET_DELAY = 20; // seconds, bet api must answer before the server timeout

// list of blocked ids : diamond casino eventId, international casino gameId, matkaEventId
const BLOCK_LIST_FIELDS = ["diamondCasinoBlock", "internationalCasinoBlock", "matkaBlock"];

// limit : downline can not have more than upline
const LIMIT_FIELDS = [...MAX_AMOUNT_FIELDS, ...MAX_PROFIT_LOSS_FIELDS];
const NUMBER_FIELDS = [...LIMIT_FIELDS, ...BET_DELAY_FIELDS];

const SETTING_KEYS = [...SPORTS_FLAGS, ...NUMBER_FIELDS, ...BLOCK_LIST_FIELDS];

const HIERARCHY_FIELDS = [
  "ownerId",
  "subownerId",
  "superadminId",
  "adminId",
  "subadminId",
  "masterId",
  "superagentId",
  "agentId",
];

const BATCH_SIZE = 1000;

// same key as getUserSportsSetting (CommonHelper) which is used at bet time
const CACHE_EXPIRY = 3600;
const cacheKey = (userId) => `sportsSetting:${userId}`;

// one setting update at a time in an owner's tree
const LOCK_EXPIRY = 60; // seconds, kept alive while the update is running
const LOCK_WAIT = 5000; // ms, how long an update waits for a running update
const LOCK_RETRY = 200; // ms
const lockKey = (ownerId) => `gameSportsSettingLock:${ownerId}`;
const lockOwnerId = (data) => String(data.ownerId || data.userId);

// downline bigger than this is updated in background, after the api response
const backgroundCascadeLimit = () =>
  Number(process.env.SPORTS_SETTING_BACKGROUND_LIMIT) || 5000;
const PENDING_RETRY_DELAY = 60000; // ms

// report : how much of the downline effect is saved with one update
const EFFECT_GROUP_LIMIT = 200;
const EFFECT_USER_LIMIT = 100;
const EFFECT_QUERY_LIMIT = 10; // count queries running together
const REPORT_MAX_SIZE = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sameId = (a, b) => Boolean(a) && Boolean(b) && String(a) === String(b);

const toStringArray = (value) => [
  ...new Set((Array.isArray(value) ? value : []).map(String)),
];

const isBlockId = (id) =>
  (typeof id === "string" && id.trim() !== "") ||
  (typeof id === "number" && Number.isFinite(id));

const sameValue = (key, a, b) => {
  if (!BLOCK_LIST_FIELDS.includes(key)) return a === b;
  const first = toStringArray(a);
  const second = toStringArray(b);
  return first.length === second.length && first.every((id) => second.includes(id));
};

// Effective value saved on the setting doc (schema default if the field is missing)
const storedValue = (doc, key) => {
  if (BLOCK_LIST_FIELDS.includes(key)) return toStringArray(doc?.[key]);
  const value = doc?.[key];
  if (value === undefined || value === null) {
    return SportsSettingModel.schema.path(key).options.default;
  }
  return value;
};

// Limit coming from upline, top level user (no upline doc) has no limit
const uplineValue = (uplineDoc, key) => {
  if (uplineDoc) return storedValue(uplineDoc, key);
  if (SPORTS_FLAGS.includes(key)) return true;
  if (LIMIT_FIELDS.includes(key)) return Infinity;
  if (BET_DELAY_FIELDS.includes(key)) return 0;
  return [];
};

const hasSelfValue = (key, selfValue) => {
  if (SPORTS_FLAGS.includes(key)) return selfValue === false;
  if (NUMBER_FIELDS.includes(key)) return typeof selfValue === "number";
  return Array.isArray(selfValue) && selfValue.length > 0;
};

// flag   : locked if upline OR user itself is locked
// limit  : user's own amount / profit loss, never more than upline
// delay  : user's own bet delay, never less than upline
// block  : upline blocked ids + user's own blocked ids
const combine = (key, upline, selfValue) => {
  if (!hasSelfValue(key, selfValue)) return upline;
  if (SPORTS_FLAGS.includes(key)) return false;
  if (LIMIT_FIELDS.includes(key)) return Math.min(upline, selfValue);
  if (BET_DELAY_FIELDS.includes(key)) return Math.max(upline, selfValue);
  return toStringArray([...upline, ...selfValue]);
};

const effectiveValues = (doc) => {
  const values = {};
  SETTING_KEYS.forEach((key) => {
    values[key] = storedValue(doc, key);
  });
  return values;
};

const hierarchyData = (userData) => {
  const data = {
    userType: userData.userType,
    creatorId: userData.creatorId || null,
  };
  HIERARCHY_FIELDS.forEach((field) => {
    data[field] = userData[field] || null;
  });
  return data;
};

const canAccessUser = (loginData, userData) => {
  if (loginData.userType === "staff") {
    return sameId(userData.ownerId, loginData.ownerId);
  }
  return sameId(userData[`${loginData.userType}Id`], loginData.userId);
};

const getUplineId = (userData) => {
  if (!userData.creatorId || sameId(userData.creatorId, userData.userId)) {
    return null;
  }
  return userData.creatorId;
};

const getUplineDoc = async (userData) => {
  const uplineId = getUplineId(userData);
  if (!uplineId) return null;
  return SportsSettingModel.findOne({ userId: uplineId }).lean();
};

const removeSettingDocFromCache = (userId) => {
  return client.del(cacheKey(userId)).catch((err) => {
    console.error("gameSportsSetting redis del error:", err.message);
  });
};

// Redis error should not break the api : the key is removed so old data does not stay in redis,
// next read takes it from database.
const saveSettingDocInCache = async (settingDoc) => {
  if (!settingDoc) return;
  try {
    await client.set(
      cacheKey(settingDoc.userId),
      JSON.stringify(settingDoc),
      "EX",
      CACHE_EXPIRY
    );
  } catch (err) {
    console.error("gameSportsSetting redis set error:", err.message);
    await removeSettingDocFromCache(settingDoc.userId);
  }
};

// Setting doc from redis, if not in redis then from database and saved in redis.
// Redis down / bad data should not break the api, database is used in that case.
const getSettingDocFromCache = async (userId) => {
  if (!userId) return null;

  try {
    const cachedData = await client.get(cacheKey(userId));
    const settingDoc = cachedData ? JSON.parse(cachedData) : null;
    if (settingDoc) return settingDoc;
  } catch (err) {
    console.error("gameSportsSetting redis get error:", err.message);
  }

  const settingDoc = await SportsSettingModel.findOne({ userId }).lean();
  await saveSettingDocInCache(settingDoc);
  return settingDoc;
};

// One setting update at a time in an owner's tree, otherwise two cascades can mix in the downline.
// The lock is kept alive while the work is running, a crashed process loses it after LOCK_EXPIRY.
const acquireSettingLock = async (ownerId, waitTime = LOCK_WAIT) => {
  const key = lockKey(ownerId);
  const token = new ObjectId().toString();
  const waitTill = Date.now() + waitTime;

  while (!(await client.set(key, token, "NX", "EX", LOCK_EXPIRY))) {
    if (Date.now() >= waitTill) return null;
    await sleep(LOCK_RETRY);
  }

  const timer = setInterval(() => {
    client.expire(key, LOCK_EXPIRY).catch(() => {});
  }, (LOCK_EXPIRY * 1000) / 3);
  timer.unref();

  return {
    ownerId,
    release: async () => {
      clearInterval(timer);
      try {
        if ((await client.get(key)) === token) await client.del(key);
      } catch (err) {
        console.error("gameSportsSetting lock release error:", err.message);
      }
    },
  };
};

// Setting doc of the user, created from upline setting if it does not exist
const getSettingDoc = (userData, uplineDoc) => {
  return SportsSettingModel.findOneAndUpdate(
    { userId: userData.userId },
    { $set: hierarchyData(userData), $setOnInsert: effectiveValues(uplineDoc) },
    { upsert: true, new: true, lean: true }
  );
};

// Only the keys whose value is different from the current one are treated as changed,
// so the panel can send the complete form without locking everything on this user.
const buildChanges = (bodyData, settingDoc, uplineDoc) => {
  const changes = {
    errors: [],
    selfSet: {},
    selfUnset: [],
    effective: {},
    oldValues: {},
    newValues: {},
    lockedByUpline: [],
  };

  SETTING_KEYS.forEach((key) => {
    if (bodyData[key] === undefined) return;

    const current = storedValue(settingDoc, key);
    const upline = uplineValue(uplineDoc, key);
    const selfValue = settingDoc.selfSetting?.[key];
    let value = bodyData[key];
    let nextSelf;

    if (SPORTS_FLAGS.includes(key)) {
      if (typeof value !== "boolean") {
        changes.errors.push(`${key} must be true or false`);
        return;
      }
      if (value === current) return;
      if (value && upline === false && selfValue !== false) {
        changes.errors.push(`${key} is locked by upline`);
        return;
      }
      if (value && upline === false) changes.lockedByUpline.push(key);
      nextSelf = value ? undefined : false;
    } else if (NUMBER_FIELDS.includes(key)) {
      const isDelay = BET_DELAY_FIELDS.includes(key);
      if (typeof value === "string" && value.trim() !== "") value = Number(value);
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        changes.errors.push(
          `${key} must be a valid ${isDelay ? "number of seconds" : "amount"}`
        );
        return;
      }
      if (isDelay && value > MAX_BET_DELAY) {
        changes.errors.push(`${key} cannot be more than ${MAX_BET_DELAY} seconds`);
        return;
      }
      if (value === current) return;
      // bet delay holds the bet api, so downline can only have same or more delay than upline
      if (isDelay && value < upline) {
        changes.errors.push(`${key} cannot be less than upline bet delay ${upline}`);
        return;
      }
      if (!isDelay && value > upline) {
        changes.errors.push(`${key} cannot be more than upline limit ${upline}`);
        return;
      }
      // same as upline means no own value, user follows upline again
      nextSelf = value === upline ? undefined : value;
    } else {
      if (!Array.isArray(value)) {
        changes.errors.push(`${key} must be an array`);
        return;
      }
      if (!value.every(isBlockId)) {
        changes.errors.push(`${key} must have valid ids only`);
        return;
      }
      // id blocked by upline can not be unblocked here, so only the extra ones are user's own
      const selfIds = toStringArray(value).filter((id) => !upline.includes(id));
      value = combine(key, upline, selfIds);
      if (sameValue(key, selfIds, selfValue) && sameValue(key, value, current)) return;
      nextSelf = selfIds.length ? selfIds : undefined;
    }

    if (nextSelf === undefined) {
      changes.selfUnset.push(key);
    } else {
      changes.selfSet[key] = nextSelf;
    }

    const nextValue = combine(key, upline, nextSelf);
    if (!sameValue(key, nextValue, current)) changes.effective[key] = nextValue;

    changes.oldValues[key] = current;
    changes.newValues[key] = value;
  });

  return changes;
};

// Filter for the setting docs of root's downline, without the downline of excluded users
const subtreeFilter = (root, excluded, excludeRoot = false) => {
  if (root.userType === "client") return { userId: root.userId };

  const rootField = `${root.userType}Id`;
  const filter = { [rootField]: root.userId };

  const excludedUserIds = excluded.map((doc) => doc.userId);
  if (excludeRoot) excludedUserIds.push(root.userId);
  if (excludedUserIds.length) filter.userId = { $nin: excludedUserIds };

  excluded.forEach((doc) => {
    const field = `${doc.userType}Id`;
    if (doc.userType === "client" || field === rootField) return;
    if (!filter[field]) filter[field] = { $nin: [] };
    filter[field].$nin.push(doc.userId);
  });

  return filter;
};

const syncBatch = async (users, inferSelf) => {
  const creatorIds = users.map((user) => user.creatorId).filter(Boolean);
  const [settingDocs, creatorDocs] = await Promise.all([
    SportsSettingModel.find({ userId: { $in: users.map((user) => user.userId) } }).lean(),
    SportsSettingModel.find({ userId: { $in: creatorIds } }).lean(),
  ]);
  const settingById = new Map(settingDocs.map((doc) => [String(doc.userId), doc]));
  const creatorById = new Map(creatorDocs.map((doc) => [String(doc.userId), doc]));

  const ops = [];
  users.forEach((user) => {
    const settingDoc = settingById.get(String(user.userId));
    const uplineDoc = creatorById.get(String(user.creatorId)) || null;
    const hierarchy = hierarchyData(user);

    if (!settingDoc) {
      ops.push({
        updateOne: {
          filter: { userId: user.userId },
          update: { $set: hierarchy, $setOnInsert: effectiveValues(uplineDoc) },
          upsert: true,
        },
      });
      return;
    }

    const update = {};
    Object.keys(hierarchy).forEach((field) => {
      if (String(settingDoc[field] || "") !== String(hierarchy[field] || "")) {
        update[field] = hierarchy[field];
      }
    });

    // Old data has no selfSetting, whatever is stricter than upline was set on this user
    if (inferSelf && uplineDoc && settingDoc.selfSetting === undefined) {
      SETTING_KEYS.forEach((key) => {
        const value = storedValue(settingDoc, key);
        const upline = storedValue(uplineDoc, key);
        if (SPORTS_FLAGS.includes(key)) {
          if (value === false && upline !== false) update[`selfSetting.${key}`] = false;
        } else if (LIMIT_FIELDS.includes(key)) {
          if (value < upline) update[`selfSetting.${key}`] = value;
        } else if (BET_DELAY_FIELDS.includes(key)) {
          if (value > upline) update[`selfSetting.${key}`] = value;
        } else {
          const selfIds = value.filter((id) => !upline.includes(id));
          if (selfIds.length) update[`selfSetting.${key}`] = selfIds;
        }
      });
    }

    if (Object.keys(update).length) {
      ops.push({
        updateOne: { filter: { userId: user.userId }, update: { $set: update } },
      });
    }
  });

  if (ops.length) {
    await SportsSettingModel.bulkWrite(ops, { ordered: false });
    await Promise.all(
      ops.map((op) => removeSettingDocFromCache(op.updateOne.filter.userId))
    );
  }
};

// Root and its complete downline in batches, from root's userType down to client,
// so creator's doc is always ready before its downline
const eachLevelBatch = async (Model, rootUser, fields, handler) => {
  const rootIndex = UserTypes.indexOf(rootUser.userType);

  for (let index = rootIndex; index >= 0; index--) {
    const where =
      index === rootIndex
        ? { userId: rootUser.userId }
        : { [`${rootUser.userType}Id`]: rootUser.userId, userType: UserTypes[index] };

    let batch = [];
    for await (const doc of Model.find(where).select(fields).lean().cursor()) {
      if (!doc.userId) continue;
      batch.push(doc);
      if (batch.length === BATCH_SIZE) {
        await handler(batch);
        batch = [];
      }
    }
    if (batch.length) await handler(batch);
  }
};

// Brings setting docs of root and its complete downline in line with the users collection:
// creates missing docs (copied from creator) and repairs the hierarchy ids.
// inferSelf is only for the one time migration of old data (scripts/migrateGameSportsSetting.js).
const syncSettingDocs = async (rootUser, inferSelf = false) => {
  const fields = ["userId", "userType", "creatorId", ...HIERARCHY_FIELDS].join(" ");
  await eachLevelBatch(UserModel, rootUser, fields, (batch) =>
    syncBatch(batch, inferSelf)
  );
};

// Saves fresh setting docs in redis for the users which are already in redis.
// Other users are loaded in redis on their first read, so redis is not filled with inactive users.
const refreshCachedSettingDocs = async (userIds) => {
  if (!userIds.length) return;

  let cachedUserIds;
  try {
    const cached = await Promise.all(
      userIds.map((userId) => client.exists(cacheKey(userId)))
    );
    cachedUserIds = userIds.filter((userId, index) => cached[index]);
  } catch (err) {
    console.error("gameSportsSetting redis exists error:", err.message);
    await Promise.all(userIds.map(removeSettingDocFromCache));
    return;
  }
  if (!cachedUserIds.length) return;

  const settingDocs = await SportsSettingModel.find({
    userId: { $in: cachedUserIds },
  }).lean();
  await Promise.all(settingDocs.map(saveSettingDocInCache));
};

// Report of setting updates (GameSportsSettingLog). A problem in the report must not stop the update.
const insertSettingLog = async (userData, loginData, changes, downlineCount, withDownline) => {
  try {
    const log = await GameSportsSettingLogModel.create({
      userId: userData.userId,
      username: userData.username,
      name: userData.name,
      ...hierarchyData(userData),
      clientId: userData.clientId || null,
      operatorId: loginData.userId,
      operatorName: `${loginData.name} (${loginData.username})`,
      operatorType: loginData.userType,
      changes: Object.keys(changes.newValues).map((key) => ({
        key,
        oldValue: changes.oldValues[key],
        newValue: changes.newValues[key],
        remark: changes.lockedByUpline.includes(key) ? "still locked by upline" : "",
      })),
      downlineCount,
      downlineStatus: withDownline ? "pending" : "none",
    });
    return log._id;
  } catch (err) {
    console.error("gameSportsSetting log insert error:", err.message);
    return null;
  }
};

const saveSettingLogEffect = async (logId, effect) => {
  if (!logId) return;
  try {
    await GameSportsSettingLogModel.updateOne(
      { _id: logId },
      { $set: { downlineStatus: "done", downlineEffect: effect } }
    );
  } catch (err) {
    console.error("gameSportsSetting log update error:", err.message);
  }
};

// Downline update of these users was completed by repair, what it changed is not known
const markSettingLogsRepaired = async (userIds) => {
  try {
    await GameSportsSettingLogModel.updateMany(
      { userId: { $in: userIds }, downlineStatus: "pending" },
      { $set: { downlineStatus: "repaired" } }
    );
  } catch (err) {
    console.error("gameSportsSetting log update error:", err.message);
  }
};

const rebuildBatch = async (settingDocs) => {
  const creatorIds = settingDocs.map((doc) => doc.creatorId).filter(Boolean);
  const creatorDocs = await SportsSettingModel.find({ userId: { $in: creatorIds } })
    .select(["userId", ...SETTING_KEYS].join(" "))
    .lean();
  const creatorById = new Map(creatorDocs.map((doc) => [String(doc.userId), doc]));

  const ops = [];
  settingDocs.forEach((doc) => {
    // top level user has nothing above it, its values stay as they are
    const uplineDoc = creatorById.get(String(doc.creatorId));
    if (!uplineDoc || sameId(doc.creatorId, doc.userId)) return;

    const update = {};
    SETTING_KEYS.forEach((key) => {
      const value = combine(key, storedValue(uplineDoc, key), doc.selfSetting?.[key]);
      if (!sameValue(key, value, storedValue(doc, key))) update[key] = value;
    });

    if (Object.keys(update).length) {
      ops.push({
        updateOne: { filter: { userId: doc.userId }, update: { $set: update } },
      });
    }
  });

  if (ops.length) {
    await SportsSettingModel.bulkWrite(ops, { ordered: false });
    await refreshCachedSettingDocs(ops.map((op) => op.updateOne.filter.userId));
  }
  return ops.length;
};

// Repair : effective values of root's complete downline are made again from selfSetting, top to down.
// Used when a downline update did not finish. Old data must be migrated before this
// (scripts/migrateGameSportsSetting.js), otherwise old locks / limits have no selfSetting and are lost.
const rebuildSettingDocs = async (rootUser) => {
  await syncSettingDocs(rootUser);

  const fields = ["userId", "creatorId", "selfSetting", ...SETTING_KEYS].join(" ");
  let repaired = 0;
  await eachLevelBatch(SportsSettingModel, rootUser, fields, async (batch) => {
    repaired += await rebuildBatch(batch);
  });

  const pendingUserIds = await SportsSettingModel.distinct("userId", {
    ...subtreeFilter(rootUser, []),
    cascadePending: true,
  });
  if (pendingUserIds.length) {
    await SportsSettingModel.updateMany(
      { userId: { $in: pendingUserIds } },
      { $unset: { cascadePending: "" } }
    );
    await refreshCachedSettingDocs(pendingUserIds);
    await markSettingLogsRepaired(pendingUserIds);
  }

  return repaired;
};

// Setting docs which an update of the downline is going to change, counted by userType and old value
const changedGroups = async (op) => {
  // downline of a client is the client itself, its old value is already known
  if (op.doc?.userType === "client") {
    return [{ userType: "client", oldValue: storedValue(op.doc, op.key), count: 1 }];
  }

  const groups = await SportsSettingModel.aggregate([
    { $match: op.filter },
    {
      $group: {
        _id: { userType: "$userType", oldValue: `$${op.key}` },
        count: { $sum: 1 },
      },
    },
  ]);

  return groups
    .map((group) => ({
      userType: group._id.userType,
      oldValue: storedValue({ [op.key]: group._id.oldValue }, op.key),
      count: group.count,
    }))
    .filter((group) => !sameValue(op.key, group.oldValue, op.value));
};

// For the report : what the update is going to change in the downline, key by key
const downlineEffect = async (keys, ops, ownSetting) => {
  const groupsByKey = new Map(keys.map((key) => [key, new Map()]));

  for (let index = 0; index < ops.length; index += EFFECT_QUERY_LIMIT) {
    const batch = ops.slice(index, index + EFFECT_QUERY_LIMIT);
    const batchGroups = await Promise.all(batch.map(changedGroups));

    batch.forEach((op, opIndex) => {
      const keyGroups = groupsByKey.get(op.key);
      batchGroups[opIndex].forEach((group) => {
        const values = [group.oldValue, op.value].map((value) =>
          JSON.stringify(Array.isArray(value) ? [...value].sort() : value)
        );
        const groupKey = [group.userType, ...values].join("|");
        if (!keyGroups.has(groupKey)) {
          keyGroups.set(groupKey, {
            userType: group.userType,
            oldValue: group.oldValue,
            newValue: op.value,
            count: 0,
          });
        }
        keyGroups.get(groupKey).count += group.count;
      });
    });
  }

  return keys.map((key) => {
    const groups = [...groupsByKey.get(key).values()].sort(
      (a, b) =>
        UserTypes.indexOf(b.userType) - UserTypes.indexOf(a.userType) ||
        b.count - a.count
    );
    return {
      key,
      updatedCount: groups.reduce((total, group) => total + group.count, 0),
      groups: groups.slice(0, EFFECT_GROUP_LIMIT),
      // downline users having their own value of this key, it is kept with the new upline value
      ownSettingCount: ownSetting[key].length,
      ownSettingUsers: ownSetting[key].slice(0, EFFECT_USER_LIMIT),
    };
  });
};

// Pushes the new effective values of the user to its downline.
// Downline users having their own value (selfSetting) keep it, combined with the new upline value.
// Returns what it changed in the downline (for the report).
const cascadeToDownline = async (userData, effective) => {
  const keys = Object.keys(effective);
  if (!keys.length || userData.userType === "client") return [];

  const rootWhere = { [`${userData.userType}Id`]: userData.userId };
  const [userCount, settingCount] = await Promise.all([
    UserModel.countDocuments(rootWhere),
    SportsSettingModel.countDocuments(rootWhere),
  ]);
  if (settingCount < userCount) await syncSettingDocs(userData);

  const selfSettingDocs = await SportsSettingModel.find({
    ...rootWhere,
    userId: { $ne: userData.userId },
    selfSetting: { $exists: true, $ne: {} },
  })
    .select(["userId", "userType", "selfSetting", ...HIERARCHY_FIELDS, ...keys].join(" "))
    .lean();

  const ops = [];
  const ownSetting = {};
  keys.forEach((key) => {
    const keyDocs = selfSettingDocs.filter((doc) =>
      hasSelfValue(key, doc.selfSetting?.[key])
    );
    const docById = new Map(keyDocs.map((doc) => [String(doc.userId), doc]));
    const uplineDocs = new Map();
    const nestedDocs = new Map();

    keyDocs.forEach((doc) => {
      const uplines = HIERARCHY_FIELDS.map((field) => docById.get(String(doc[field])))
        .filter((upline) => upline && upline !== doc);
      uplineDocs.set(doc, uplines);
      uplines.forEach((upline) => {
        if (!nestedDocs.has(upline)) nestedDocs.set(upline, []);
        nestedDocs.get(upline).push(doc);
      });
    });

    ops.push({
      key,
      filter: subtreeFilter(userData, keyDocs, true),
      value: effective[key],
    });

    ownSetting[key] = [];
    keyDocs.forEach((doc) => {
      let value = effective[key];
      [...uplineDocs.get(doc), doc].forEach((selfDoc) => {
        value = combine(key, value, selfDoc.selfSetting[key]);
      });
      ownSetting[key].push({
        userId: doc.userId,
        userType: doc.userType,
        ownValue: doc.selfSetting[key],
        oldValue: storedValue(doc, key),
        newValue: value,
      });
      if (sameValue(key, value, storedValue(doc, key))) return;
      ops.push({
        key,
        filter: subtreeFilter(doc, nestedDocs.get(doc) || []),
        value,
        doc,
      });
    });
  });

  // counted before the update, old values are gone after it
  const effect = await downlineEffect(keys, ops, ownSetting);

  await SportsSettingModel.bulkWrite(
    ops.map((op) => ({
      updateMany: { filter: op.filter, update: { $set: { [op.key]: op.value } } },
    })),
    { ordered: false }
  );

  return effect;
};

// Redis update of the downline after setting update
const refreshDownlineCache = async (userData) => {
  const cursor = SportsSettingModel.find({
    [`${userData.userType}Id`]: userData.userId,
    userId: { $ne: userData.userId },
  })
    .select("userId")
    .lean()
    .cursor();

  let batch = [];
  for await (const doc of cursor) {
    batch.push(doc.userId);
    if (batch.length === BATCH_SIZE) {
      await refreshCachedSettingDocs(batch);
      batch = [];
    }
  }
  await refreshCachedSettingDocs(batch);
};

// cascadePending is set on the user's doc with its new values and removed here,
// so an update which stopped in between can be found and completed
const finishDownlineUpdate = async (userData, effective, logId) => {
  const effect = await cascadeToDownline(userData, effective);
  await SportsSettingModel.updateOne(
    { userId: userData.userId },
    { $unset: { cascadePending: "" } }
  );
  await saveSettingLogEffect(logId, effect);
  await refreshDownlineCache(userData);
};

// Completes the downline updates of an owner's tree which did not finish (error / server restart).
// Caller holds the lock of this owner.
const finishPendingCascades = async (ownerId) => {
  const pendingDocs = await SportsSettingModel.find({ cascadePending: true })
    .select(["userId", "userType", ...HIERARCHY_FIELDS].join(" "))
    .lean();
  pendingDocs.sort(
    (a, b) => UserTypes.indexOf(b.userType) - UserTypes.indexOf(a.userType)
  );

  for (const doc of pendingDocs) {
    if (lockOwnerId(doc) !== ownerId) continue;
    // rebuild of an upline has already completed it
    const stillPending = await SportsSettingModel.exists({
      userId: doc.userId,
      cascadePending: true,
    });
    if (stillPending) await rebuildSettingDocs(doc);
  }
};

// Called on server start (app.js) and after a failed background update
const resumePendingCascades = async () => {
  try {
    const pendingDocs = await SportsSettingModel.find({ cascadePending: true })
      .select("userId ownerId")
      .lean();
    const ownerIds = [...new Set(pendingDocs.map(lockOwnerId))];

    for (const ownerId of ownerIds) {
      // a running update keeps its lock alive, a crashed one loses it after LOCK_EXPIRY
      const lock = await acquireSettingLock(ownerId, (LOCK_EXPIRY + 10) * 1000);
      if (!lock) continue;
      try {
        await finishPendingCascades(ownerId);
      } finally {
        await lock.release();
      }
    }
  } catch (err) {
    console.error("gameSportsSetting resumePendingCascades error:", err);
  }
};

// Big downline is updated after the api response, the lock is released when it is done
const finishDownlineInBackground = async (userData, effective, logId, lock) => {
  try {
    await finishDownlineUpdate(userData, effective, logId);
    await saveSettingDocInCache(
      await SportsSettingModel.findOne({ userId: userData.userId }).lean()
    );
  } catch (err) {
    console.error("gameSportsSetting downline update error:", err);
    setTimeout(resumePendingCascades, PENDING_RETRY_DELAY).unref();
  } finally {
    await lock.release();
  }
};

// Repair of root and its complete downline, for scripts/repairGameSportsSetting.js
const repairSettingDocs = async (rootUser) => {
  const lock = await acquireSettingLock(
    lockOwnerId(rootUser),
    (LOCK_EXPIRY + 10) * 1000
  );
  if (!lock) throw new Error("another setting update is in progress");
  try {
    return await rebuildSettingDocs(rootUser);
  } finally {
    await lock.release();
  }
};

const updateGameSportsSetting = async (bodyData, loginData) => {
  if (!ObjectId.isValid(bodyData.downlineUserId)) {
    return returnResponse("error", "downlineUserId is required");
  }

  const userData = await UserModel.findOne({
    userId: new ObjectId(bodyData.downlineUserId),
  }).lean();

  if (!userData || !canAccessUser(loginData, userData)) {
    return returnResponse("error", "downline User Not Found");
  }

  if (sameId(userData.userId, loginData.userId) && userData.userType !== "owner") {
    return returnResponse("error", "you are not authorised to update your own setting");
  }

  // without redis the lock and the cache can not be kept right, so nothing is updated
  let lock;
  try {
    lock = await acquireSettingLock(lockOwnerId(userData));
  } catch (err) {
    console.error("gameSportsSetting lock error:", err.message);
    return returnResponse("error", "setting update is not available right now, please try again");
  }
  if (!lock) {
    return returnResponse("error", "another setting update is in progress, please try again");
  }

  let lockInBackground = false;
  try {
    await finishPendingCascades(lock.ownerId);

    const uplineDoc = await getUplineDoc(userData);
    const settingDoc = await getSettingDoc(userData, uplineDoc);

    const changes = buildChanges(bodyData, settingDoc, uplineDoc);
    if (changes.errors.length) {
      return returnResponse("error", changes.errors.join(", "));
    }

    const withDownline =
      Object.keys(changes.effective).length > 0 && userData.userType !== "client";

    const update = {};
    const setData = { ...changes.effective };
    Object.keys(changes.selfSet).forEach((key) => {
      setData[`selfSetting.${key}`] = changes.selfSet[key];
    });
    if (withDownline) setData.cascadePending = true;
    if (Object.keys(setData).length) update.$set = setData;
    if (changes.selfUnset.length) {
      update.$unset = {};
      changes.selfUnset.forEach((key) => {
        update.$unset[`selfSetting.${key}`] = "";
      });
    }

    if (!Object.keys(update).length) {
      return returnResponse("success", "gameSportsSetting already up to date", settingDoc);
    }

    await SportsSettingModel.updateMany({ userId: userData.userId }, update);

    // user itself is also counted here
    const downlineCount = withDownline
      ? await UserModel.countDocuments({ [`${userData.userType}Id`]: userData.userId })
      : 0;
    const inBackground = downlineCount > backgroundCascadeLimit();

    const logId = await insertSettingLog(
      userData,
      loginData,
      changes,
      Math.max(downlineCount - 1, 0),
      withDownline
    );

    if (withDownline && !inBackground) {
      await finishDownlineUpdate(userData, changes.effective, logId);
    }

    const updatedDoc = await SportsSettingModel.findOne({ userId: userData.userId }).lean();
    await saveSettingDocInCache(updatedDoc);

    if (inBackground) {
      lockInBackground = true;
      finishDownlineInBackground(userData, changes.effective, logId, lock);
    }

    await InsertUserActivity(
      {
        activityType: "sportsSetting",
        oldActivity: JSON.stringify(changes.oldValues),
        newActivity: JSON.stringify(changes.newValues),
        remark: "",
      },
      {
        ...userData,
        operatorId: loginData.userId,
        operatorName: `${loginData.name} (${loginData.username})`,
      }
    );

    let message = "gameSportsSetting successfully updated";
    if (changes.lockedByUpline.length) {
      message += `, still locked by upline: ${changes.lockedByUpline.join(", ")}`;
    }
    if (inBackground) message += ", downline update is in progress";
    return returnResponse("success", message, updatedDoc);
  } finally {
    if (!lockInBackground) await lock.release();
  }
};

const getGameSportsSetting = async (bodyData, loginData) => {
  const userId = bodyData.downlineUserId || loginData.userId;
  if (!ObjectId.isValid(userId)) {
    return returnResponse("error", "downlineUserId is required");
  }

  const userData = await UserModel.findOne({ userId: new ObjectId(userId) })
    .select(["userId", "userType", "creatorId", ...HIERARCHY_FIELDS].join(" "))
    .lean();

  if (!userData || !canAccessUser(loginData, userData)) {
    return returnResponse("error", "downline User Not Found");
  }

  const [settingDoc, uplineDoc] = await Promise.all([
    getSettingDocFromCache(userData.userId),
    getSettingDocFromCache(getUplineId(userData)),
  ]);

  const settingData = settingDoc || {
    userId: userData.userId,
    ...hierarchyData(userData),
    ...effectiveValues(uplineDoc),
  };

  return returnResponse("success", "gameSportsSetting fetched successfully", {
    ...settingData,
    selfSetting: settingData.selfSetting || {},
    // upline limits : flag false / id in a block list can not be opened,
    // amount and profit loss can not be more than this, bet delay can not be less than this
    uplineSetting: uplineDoc ? effectiveValues(uplineDoc) : null,
  });
};

// Who changed which setting of which user and what it changed in that user's downline
const getGameSportsSettingReport = async (bodyData, loginData) => {
  const queryObj = {};

  if (bodyData.downlineUserId) {
    if (!ObjectId.isValid(bodyData.downlineUserId)) {
      return returnResponse("error", "downlineUserId is not valid");
    }
    const userData = await UserModel.findOne({
      userId: new ObjectId(bodyData.downlineUserId),
    })
      .select(["userId", "userType", ...HIERARCHY_FIELDS].join(" "))
      .lean();
    if (!userData || !canAccessUser(loginData, userData)) {
      return returnResponse("error", "downline User Not Found");
    }
    queryObj.userId = userData.userId;
  } else if (loginData.userType === "staff") {
    queryObj.ownerId = loginData.ownerId;
  } else {
    queryObj[`${loginData.userType}Id`] = loginData.userId;
  }

  if (bodyData.operatorId) {
    if (!ObjectId.isValid(bodyData.operatorId)) {
      return returnResponse("error", "operatorId is not valid");
    }
    queryObj.operatorId = bodyData.operatorId;
  }

  if (bodyData.key) {
    if (!SETTING_KEYS.includes(bodyData.key)) {
      return returnResponse("error", "key is not valid");
    }
    queryObj["changes.key"] = bodyData.key;
  }

  if (bodyData.fromDate || bodyData.toDate) {
    queryObj.date = await dateWhereCond(bodyData.fromDate, bodyData.toDate);
  }

  const pageNo = Number(bodyData.pageNo) || 1;
  const size = Number(bodyData.size) || 20;
  if (!Number.isInteger(pageNo) || pageNo < 1) {
    return returnResponse("error", "pageNo is not valid");
  }
  if (!Number.isInteger(size) || size < 1 || size > REPORT_MAX_SIZE) {
    return returnResponse("error", `size must be between 1 and ${REPORT_MAX_SIZE}`);
  }

  const [totalData, logs] = await Promise.all([
    GameSportsSettingLogModel.countDocuments(queryObj),
    GameSportsSettingLogModel.find(queryObj)
      .sort({ _id: -1 })
      .skip(size * (pageNo - 1))
      .limit(size)
      .select({
        userId: 1,
        username: 1,
        name: 1,
        userType: 1,
        operatorId: 1,
        operatorName: 1,
        operatorType: 1,
        changes: 1,
        downlineCount: 1,
        downlineStatus: 1,
        downlineEffect: 1,
        date: 1,
        createdAt: 1,
      })
      .lean(),
  ]);

  // names of the downline users which kept their own setting
  const ownSettingUserIds = [];
  logs.forEach((log) => {
    (log.downlineEffect || []).forEach((effect) => {
      effect.ownSettingUsers.forEach((user) => ownSettingUserIds.push(user.userId));
    });
  });
  const users = ownSettingUserIds.length
    ? await UserModel.find({ userId: { $in: ownSettingUserIds } })
        .select("userId username name")
        .lean()
    : [];
  const userById = new Map(users.map((user) => [String(user.userId), user]));
  logs.forEach((log) => {
    (log.downlineEffect || []).forEach((effect) => {
      effect.ownSettingUsers.forEach((user) => {
        const userData = userById.get(String(user.userId));
        user.username = userData?.username || null;
        user.name = userData?.name || null;
      });
    });
  });

  return returnResponse("success", "gameSportsSetting report fetched successfully", {
    totalData,
    pageNo,
    size,
    list: logs,
  });
};

module.exports = {
  updateGameSportsSetting,
  getGameSportsSetting,
  getGameSportsSettingReport,
  syncSettingDocs,
  repairSettingDocs,
  resumePendingCascades,
};
