"use strict";

let game;

let game_started = false;

let level_number = 1;

let map;

/* state:
 * STAND: waiting for input
 * HOP: moving along building
 * FLY: flying around
 * LOST: flew offscreen
 * FAIL: exploded due to running into an object
 * WIN: completed level
 */
let State = { STAND: 0, HOP: 1, FLY: 2, LOST: 3, FAIL: 4, WIN: 5 };

let game_state = State.STAND;

let intitle = true;
let wonitall = false;

let save_data = 1;
const SAVE_KEY = "casso.pigeonpostpuzzle.save";

zb.ready(function() {
    game = zb.create_game({
        canvas: 'canvas',
        canvas_w: 768,
        canvas_h: 576,
        draw_scale: 3,
        tile_size: 16,
        level_w: 16,
        level_h: 12,
        background_color: '#CFD8FF',
        draw_func: do_draw,
        update_func: do_update,
        run_in_background: true,
        save_key: SAVE_KEY,
        events: {
            keydown: handle_keydown,
            keyup: handle_keyup,
            mouseup: handle_mouseup,
            gamestart: handle_gamestart,
        },
    });

    game.register_sfx({
        flap: {
            path: 'sfx/flap.wav',
            volume: 1.0,
        },
        whoosh: {
            path: 'sfx/whoosh.wav',
            volume: 0.6,
        },
        launch: {
            path: 'sfx/launch.wav',
            volume: 0.6,
        },
        alight: {
            path: 'sfx/alight.wav',
            volume: 0.3,
        },
        deliver: {
            path: 'sfx/deliver.wav',
            volume: 0.3,
        },
        push: {
            path: 'sfx/push.wav',
            volume: 0.5,
        },
    });

    game.register_images({
        tiles: 'tiles.png',
        pigeon: 'pigeon.png',
        wind: 'wind.png',
        fan: 'fan.png',
        mailbox: 'mailbox.png',
        complete: 'complete.png',
        failed: 'failed.png',
        cloud: 'cloud.png',
        title: 'title.png',
        win: 'win.png',
        levelimages: {
            1: 'level-images/1.png',
            2: 'level-images/2.png',
            3: 'level-images/3.png',
            4: 'level-images/4.png',
            5: 'level-images/5.png',
            6: 'level-images/6.png',
            7: 'level-images/7.png',
            8: 'level-images/8.png',
            9: 'level-images/9.png',
            10: 'level-images/10.png',
            11: 'level-images/11.png',
            12: 'level-images/12.png',
            13: 'level-images/13.png',
            14: 'level-images/14.png',
            15: 'level-images/15.png',
        },
    });

    game.register_music({
        pigeonwin: {
            path: 'sfx/pigeonwin.wav',
            volume: 0.45,
            loop: false,
        },
        pigeonfail: {
            path: 'sfx/pigeonfail.wav',
            volume: 0.45,
            loop: false,
        },
        menu: {
            path: 'sfx/pigeonmenu',
            volume: 0.8,
        },
        ingame: {
            path: 'sfx/pigeonjazz',
            volume: 0.8,
        },
    });

    game.resources_ready();

    for (let i = 0; i < 26; i++) {
        make_cloud(Math.random() * (game.screen_w + 50) - 50);
    }

    game.music.pigeonwin.addEventListener("ended", function() {
        restart_regular_music();
    });

    game.music.pigeonfail.addEventListener("ended", function() {
        restart_regular_music();
    });
});

function restart_regular_music() {
    console.log("Okay!");
    if (intitle) {
        game.music.menu.play();
    } else {
        game.music.ingame.play();
    }
}

let ID = {
    empty: 0,
    buildingtop: 1,
    chimney: 6,
}

let walkable = {
    [ID.buildingtop]: 1,
}

let blockwind = {
    [ID.buildingtop]: 1,
    [ID.chimney]: 1,
}

let blowy = {
    [ID.wind_up]: 1,
    [ID.wind_down]: 1,
    [ID.wind_left]: 1,
    [ID.wind_right]: 1,
}

function delete_save() {
    try {
        game.save('level_num', 1);
    } catch (e) {
        console.error("oops, can't save! though that uh... doesn't matter here");
    }
}

function save() {
    try {
        if (!levels.hasOwnProperty(level_number + 1)) {
            console.log("am at end");
            game.save('level_num', 1);
        } else {
            game.save('level_num', level_number + 1);
        }
    } catch (e) {
        console.error("oops, can't save!", e);
    }
}

function handle_gamestart(game) {
    console.log("Game start!");
    game.music.menu.play();

    save_data = parseInt(game.load('level_num') || "1");
    level_number = save_data;

}

let undo_stack = [];

function copy_list(list) {
    let newlist = [];
    for (let x of list) {
        newlist.push(x);
    }
    return newlist;
}

function copy_flat_objlist(list) {
    let newlist = [];
    for (let x of list) {
        newlist.push({ ...x });
    }
    return newlist;
}

function create_undo_point() {
    let undo_point = {
        charx: character.x,
        chary: character.y,
        chardir: character.variant,
        fanlocs: [],
        mailboxes: copy_flat_objlist(mailboxes),
    }

    for (let f of fans) {
        undo_point.fanlocs.push({
            x: f.x,
            y: f.y,
            dir: f.variant,
        });
    }

    undo_stack.push(undo_point);
}

function undo() {
    if (undo_stack.length === 0) return;

    let undo_point = undo_stack.pop();

    character.x = undo_point.charx;
    character.y = undo_point.chary;
    character.target_x = undo_point.charx;
    character.target_y = undo_point.chary;
    character.move_fraction = 0;
    character.variant = undo_point.chardir;

    mailboxes = undo_point.mailboxes;

    animatable_things = [ character, ...mailboxes ];

    fans = [];
    wind = [];

    for (let f of undo_point.fanlocs) {
        add_fan(f.x, f.y, f.dir);
    }

    game_state = State.STAND;
    set_anim(character, 'stand');
}

function reset() {
    game.start_transition(zb.transition.FADE, 500, function() {
        load_level();
        game_state = State.STAND;
    });
}

function advance_level() {
    if (wonitall) {
        game.long_transition(zb.transition.FADE, 1000, function() {
            level_number = 1;
            wonitall = false;
            intitle = true;
        });
        return;
    }

    if (intitle) {
        game.long_transition(zb.transition.FADE, 500, function() {
            load_level();
            intitle = false;
            game.music.menu.pause();
            game.music.ingame.play();
        });
        return;
    }

    game.start_transition(zb.transition.FADE, 500, function() {
        if (level_number < Object.keys(levels).length) {
            level_number ++;
        } else {
            win_everything();
            return;
        }
        load_level();
    });
}

function win_everything() {
    game.long_transition(zb.transition.FADE, 1000, function() {
        wonitall = true;
    });
}

function load_level() {
    if (level_number > Object.keys(levels).length) {
        win_everything();
    } else {
        load_level_data(levels[level_number]);
    }
}

function load_level_data(lvl) {
    undo_stack = [];

    game_state = State.STAND;

    map = lvl.map;

    wind = [];
    animatable_things = [ character ];
    fans = [];
    mailboxes = [];
    clouds = [];

    for (let f of lvl.fans) {
        add_fan(f.x, f.y, dirnamemapping[f.dir]);
    }

    for (let m of lvl.mailboxes) {
        add_mailbox(m.x, m.y);
    }

    for (let i = 0; i < 26; i++) {
        make_cloud(Math.random() * (game.screen_w + 50) - 50);
    }

    character.x = lvl.start_x;
    character.y = lvl.start_y;
    character.target_x = character.x;
    character.target_y = character.y;
    character.variant = Dir.RIGHT;
    character.move_fraction = 0;
    set_anim(character, 'stand');
    character.futile = false;
}

let character = {
    x: 3,
    y: 3,
    anim: 'stand',
    anims: {
        stand: [ [ 0, 1000 ] ],
        hop: [ [ 1, 250 ], [ 0, 250 ] ],
        fly: [ [ 2, 1000 ] ],
        flap: [ [ 4, 60 ], [ 3, 60 ] ],
        explode: [ [ 5, 150 ], [ 6, 150 ], [ 7, 150 ], [ 8, 150 ], [ 9, 150 ], [ 10, 150 ] ],
        exploded: [ [ 10, 1000 ] ],
    },
    anim_timer: 0,
    frame: 0,
    move_fraction: 0,
    target_x: 3,
    target_y: 3,
    variant: 1,
    sprite: {
        img: 'pigeon',
        w: 20,
        h: 30,
        x_offset: 2,
        y_offset: 11,
    }
}

let animatable_things = [ character ];

let tile_animation_frame = 0;
let tile_frame_timer = 0;
const TILE_FRAME_LENGTH = 100;

function set_anim(thing, new_anim) {
    if (new_anim != thing.anim) {
        thing.anim = new_anim;
        thing.anim_timer = 0;
        thing.frame = 0;
    }
}

function tile_at(x, y) {
    return map[y * game.level_w + x];
}

function wind_at(x, y) {
    return wind.filter(w => w.x === x && w.y === y);
}

function fan_at(x, y) {
    return fans.filter(f => f.x === x && f.y === y);
}

function mailbox_at(x, y) {
    return mailboxes.filter(m => m.x === x && m.y === y);
}

function can_land_on(x, y) {
    return walkable[tile_at(x, y)] && fan_at(x, y).length === 0 && mailbox_at(x, y).length === 0;
}

function check_fly(dx, dy) {
    if (check_step(dx, dy)) {
        /* We take a step, can't fly here */
        return false;
    }

    let x = character.x;
    let y = character.y;
    while (x >= 0 && y >= 0 && x < game.level_w && y < game.level_h) {
        /* Look somewhere down the line for a walkable tile... */
        x += dx;
        y += dy;
        if (blockwind[tile_at(x, y)] && !walkable[tile_at(x, y)]) {
            return false;
        }
        if (can_land_on(x, y)) {
            return true;
        }
        if (wind_at(x, y).length > 0) {
            return true;
        }
    }
    return false;
}

const Dir = {
    DOWN: 0,
    RIGHT: 1,
    LEFT: 2,
    UP: 3,
}

const opposite_dir = {
    [Dir.UP]: Dir.DOWN,
    [Dir.DOWN]: Dir.UP,
    [Dir.LEFT]: Dir.RIGHT,
    [Dir.RIGHT]: Dir.LEFT,
}

const dirnamemapping = {
    up: Dir.UP,
    down: Dir.DOWN,
    left: Dir.LEFT,
    right: Dir.RIGHT,
}

function adjust_char_dir(dx, dy) {
    if (dy > 0) {
        character.variant = Dir.DOWN;
    } else if (dx > 0) {
        character.variant = Dir.RIGHT;
    } else if (dx < 0) {
        character.variant = Dir.LEFT;
    } else if (dy < 0) {
        character.variant = Dir.UP;
    }
}

let wind = [];

let fans = [];

let mailboxes = [];

let clouds = [];

function add_mailbox(x, y) {
    let new_mailbox = {
        x: x,
        y: y,
        target_x: x,
        target_y: y,
        variant: 0,
        frame: 0,
        anim_timer: 0,
        anim: 'stand',
        anims: {
            stand: [ [ 0, 1000 ] ],
            close: [ [ 1, 100 ], [ 2, 100 ], [ 3, 100 ], [ 4, 100 ], [ 5, 100 ], [ 6, 100 ], [ 7, 200 ], [ 8, 100 ], [ 9, 100 ], [ 10, 100 ], [ 11, 100 ] ],
            closed: [ [ 11, 1000 ] ],
        },
        sprite: {
            img: 'mailbox',
            w: 16,
            h: 24,
            x_offset: 0,
            y_offset: 8,
        },
    }

    mailboxes.push(new_mailbox);
    animatable_things.push(new_mailbox);
}

function add_fan(x, y, dir) {
    let new_fan = {
        x: x,
        y: y,
        target_x: x,
        target_y: y,
        variant: dir,
        frame: 0,
        anim_timer: 0,
        anim: 'blow',
        anims: {
            blow: [ [ 0, 100 ], [ 1, 100 ], [ 2, 100 ], [ 3, 100 ] ]
        },
        sprite: {
            img: 'fan',
            w: 16,
            h: 20,
            x_offset: 0,
            y_offset: 4,
        },
        wind: [],
        new_wind: [],
    }

    fans.push(new_fan);
    animatable_things.push(new_fan);

    let dx = 0, dy = 0;
    switch (dir) {
        case Dir.UP:
            dy = -1;
            break;
        case Dir.DOWN:
            dy = 1;
            break;
        case Dir.LEFT:
            dx = -1;
            break;
        case Dir.RIGHT:
            dx = 1;
            break;
        default:
            console.error("what");
            return;
    }

    let wind_col = add_wind_column(x, y, dx, dy, dir, {});
    new_fan.wind = wind_col;
}

function update_fan_wind_columns() {
    for (let f of fans) {
        if (f.target_x > f.x) {
            /* Moving right */
            switch (f.variant) {
                case Dir.UP:
                case Dir.DOWN:
                    for (let w of f.wind) {
                        w.box.x = Math.round(game.tile_size * f.move_fraction);
                        w.box.w = Math.round(game.tile_size * (1 - f.move_fraction));
                        w.box.h = game.tile_size;
                    }
                    for (let w of f.new_wind) {
                        w.box.w = Math.round(game.tile_size * f.move_fraction);
                        w.box.h = game.tile_size;
                    }
                    break;
                case Dir.LEFT:
                    f.new_wind[0].box.w = Math.round(game.tile_size * f.move_fraction);
                    f.new_wind[0].box.h = game.tile_size;
                    break;
                case Dir.RIGHT:
                    f.wind[0].box.x = Math.round(game.tile_size * f.move_fraction);
                    f.wind[0].box.w = Math.round(game.tile_size * (1 - f.move_fraction));
                    f.wind[0].box.h = game.tile_size;
                    break;
            }
        }
        if (f.target_x < f.x) {
            /* Moving left */
            switch (f.variant) {
                case Dir.UP:
                case Dir.DOWN:
                    for (let w of f.wind) {
                        w.box.w = Math.round(game.tile_size * (1 - f.move_fraction));
                        w.box.h = game.tile_size;
                    }
                    for (let w of f.new_wind) {
                        w.box.x = Math.round(game.tile_size * (1 - f.move_fraction));
                        w.box.w = Math.round(game.tile_size * f.move_fraction);
                        w.box.h = game.tile_size;
                    }
                    break;
                case Dir.LEFT:
                    f.wind[0].box.w = Math.round(game.tile_size * (1 - f.move_fraction));
                    f.wind[0].box.h = game.tile_size;
                    break;
                case Dir.RIGHT:
                    f.new_wind[0].box.x = Math.round(game.tile_size * (1 - f.move_fraction));
                    f.new_wind[0].box.w = Math.round(game.tile_size * f.move_fraction);
                    f.new_wind[0].box.h = game.tile_size;
                    break;
            }
        }
        if (f.target_y > f.y) {
            /* Moving down */
            switch (f.variant) {
                case Dir.LEFT:
                case Dir.RIGHT:
                    for (let w of f.wind) {
                        w.box.y = Math.round(game.tile_size * f.move_fraction);
                        w.box.w = game.tile_size;
                        w.box.h = Math.round(game.tile_size * (1 - f.move_fraction));
                    }
                    for (let w of f.new_wind) {
                        w.box.w = game.tile_size;
                        w.box.h = Math.round(game.tile_size * f.move_fraction);
                    }
                    break;
                case Dir.UP:
                    f.new_wind[0].box.w = game.tile_size;
                    f.new_wind[0].box.h = Math.round(game.tile_size * f.move_fraction);
                    break;
                case Dir.DOWN:
                    f.wind[0].box.y = Math.round(game.tile_size * f.move_fraction);
                    f.wind[0].box.w = game.tile_size;
                    f.wind[0].box.h = Math.round(game.tile_size * (1 - f.move_fraction));
                    break;
            }
        }
        if (f.target_y < f.y) {
            /* Moving up */
            switch (f.variant) {
                case Dir.LEFT:
                case Dir.RIGHT:
                    for (let w of f.wind) {
                        w.box.w = game.tile_size;
                        w.box.h = Math.round(game.tile_size * (1 - f.move_fraction));
                    }
                    for (let w of f.new_wind) {
                        w.box.y = Math.round(game.tile_size * (1 - f.move_fraction));
                        w.box.w = game.tile_size;
                        w.box.h = Math.round(game.tile_size * f.move_fraction);
                    }
                    break;
                case Dir.UP:
                    f.wind[0].box.w = game.tile_size;
                    f.wind[0].box.h = Math.round(game.tile_size * (1 - f.move_fraction));
                    break;
                case Dir.DOWN:
                    f.new_wind[0].box.y = Math.round(game.tile_size * (1 - f.move_fraction));
                    f.new_wind[0].box.w = game.tile_size;
                    f.new_wind[0].box.h = Math.round(game.tile_size * f.move_fraction);
                    break;
            }
        }
    }
}

function add_wind(x, y, dir, params) {
    let new_wind = {
        x: x,
        y: y,
        variant: dir,
        frame: 0,
        anim_timer: 0,
        anim: 'blow',
        anims: {
            blow: [ [ 0, 100 ], [ 1, 100 ], [ 2, 100 ], [ 3, 100 ] ]
        },
        sprite: {
            img: 'wind',
            w: 16,
            h: 16,
            x_offset: 0,
            y_offset: 0,
        },
        is_wind: true,
        ...params,
    }

    if (!new_wind.box) {
        new_wind.box = {
            x: 0,
            y: 0,
            w: 16,
            h: 16,
        }
    }

    wind.push(new_wind);
    animatable_things.push(new_wind);

    return new_wind;
}

function add_wind_column(x, y, dx, dy, dir, params) {
    let windlist = [];
    let px = x + dx, py = y + dy;
    let started_over_land = false;
    if (walkable[tile_at(px, py)]) {
        started_over_land = true;
    }
    while (px >= 0 && py >= 0 && px < game.level_w && py < game.level_h && (started_over_land || !walkable[tile_at(px, py)])) {
        if (blockwind[tile_at(px, py)] && !walkable[tile_at(px, py)]) {
            break;
        }
        let new_wind = add_wind(px, py, dir, params);
        windlist.push(new_wind);
        px += dx;
        py += dy;
        if (!walkable[tile_at(px, py)]) {
            started_over_land = false;
        }
    }
    return windlist;
}

function do_fly(dx, dy, from_wind) {
    adjust_char_dir(dx, dy);

    character.futile = false;

    /* Search for fly target */
    let x = character.x;
    let y = character.y;
    let can_do_fly = false;
    let blocked = false;
    while (x >= -1 && y >= -1 && x < game.level_w + 1 && y < game.level_h + 1) {
        x += dx;
        y += dy;
        if (blockwind[tile_at(x, y)] && !can_land_on(x, y)) {
            /* Fan is blocking us; can't fly */
            /* Target the tile right before, and if we're redirected by wind we lose here */
            x -= dx;
            y -= dy;
            console.log("Blocked by: ", tile_at(x, y), "at", x, y);
            blocked = true;
            break;
        }
        let wa = wind_at(x, y);
        if (can_land_on(x, y) || wa.length > 0) {
            if (wa.length == 1) {
                if (wa[0].variant === Dir.UP && dy < 0) continue;
                if (wa[0].variant === Dir.DOWN && dy > 0) continue;
                if (wa[0].variant === Dir.LEFT && dx < 0) continue;
                if (wa[0].variant === Dir.RIGHT && dx > 0) continue;
            }
            can_do_fly = true;
            break;
        }
    }

    /* If we are being bounced off wind, we can fly offscreen,
     * but if we are trying to fly off of a random building,
     * we shouldn't be allowed to. */
    if (!can_do_fly) {
        can_do_fly = from_wind;
        if (blocked) {
            character.futile = true;
        }
    }

    if (can_do_fly) {
        if (!from_wind) {
            game.sfx.launch.play();
            create_undo_point();
        }
        last_dx = dx;
        last_dy = dy;

        character.target_x = x;
        character.target_y = y;
        set_anim(character, 'fly');
        game_state = State.FLY;
        if (wind_at(character.target_x, character.target_y).length > 0) {
            character.flying_into_wind = true;
        } else {
            character.flying_into_wind = false;
        }
    }
}

function check_step(dx, dy) {
    if (can_land_on(character.x + dx, character.y + dy)) {
        return true;
    }
    /* We can also push the fan */
    if (walkable[tile_at(character.x + dx, character.y + dy)]
            && fan_at(character.x + dx, character.y + dy).length > 0
            && can_land_on(character.x + dx * 2, character.y + dy * 2)) {
        return true;
    }
    /* If we bump into a mailbox, close it */
    let mail = mailbox_at(character.x + dx, character.y + dy)
    if (mail.length > 0) {
        if (mail[0].anim === 'stand') {
            create_undo_point();
            game.sfx.deliver.play();
            set_anim(mail[0], 'close');
        }
        return false;
    }
    return false;
}

let last_dx = 0, last_dy = 0;

function do_move(dx, dy) {
    if (game_state === State.STAND) {
        character.futile = false;
        adjust_char_dir(dx, dy);

        if (check_step(dx, dy)) {
            create_undo_point();

            last_dx = dx;
            last_dy = dy;

            set_anim(character, 'hop');
            game_state = State.HOP;
            character.target_x = character.x + dx;
            character.target_y = character.y + dy;
            let fan = fan_at(character.target_x, character.target_y);
            if (fan.length) {
                let f = fan[0];
                f.target_x = f.x + dx;
                f.target_y = f.y + dy;
                game.sfx.push.play();
                if (f.variant === character.variant) {
                    f.new_wind = f.wind;
                    if (f.new_wind.length > 0) {
                        f.wind = [ f.new_wind.shift() ];
                    }
                } else if (f.variant === opposite_dir[character.variant]) {
                    f.new_wind = f.wind;
                    f.wind = [];
                    f.new_wind.unshift(add_wind(f.x, f.y, f.variant, { box: { x: 0, y: 0, w: 0, h: 0 } }));
                } else {
                    /* Perpendicular */
                    let fdx = 0, fdy = 0;
                    switch (f.variant) {
                        case Dir.UP:
                            fdy = -1;
                            break;
                        case Dir.DOWN:
                            fdy = 1;
                            break;
                        case Dir.LEFT:
                            fdx = -1;
                            break;
                        case Dir.RIGHT:
                            fdx = 1;
                            break;
                        default:
                            console.error("what");
                            return;
                    }
                    f.new_wind = add_wind_column(f.target_x, f.target_y, fdx, fdy, f.variant, { box: { x: 0, y: 0, w: 0, h: 0 } });
                }
            }
        } else if (check_fly(dx, dy) && (dx !== last_dx || dy !== last_dy)) {
            /* Don't fly using this logic if we are moving the same direction as last move
             * (i.e. holding down the key) -- that way we can only fly with the keydown logic.
             * But if we are moving a different direction it's intentional, so we can
             * fly no matter what. */
            do_fly(dx, dy);
        }
    }
}

let new_cloud_timer = 0;
const CLOUD_INTERVAL = 1800;

/* MAIN UPDATE FUNCTION */
function do_update(delta) {
    tile_frame_timer += delta;
    while (tile_frame_timer > TILE_FRAME_LENGTH) {
        tile_frame_timer -= TILE_FRAME_LENGTH;
        tile_animation_frame ++;
        tile_animation_frame = zb.mod(tile_animation_frame, 1);
    }

    if (game_state === State.WIN || game_state === State.LOST || game_state === State.FAIL) {
        message_alpha += delta / MESSAGE_FADE_TIME;
        if (message_alpha > 1) {
            message_alpha = 1;
        }
    } else {
        message_alpha = 0;
    }

    move_char(delta);

    update_anims(delta);

    update_clouds(delta);
}

function make_cloud(x) {
    clouds.push({
        x: x,
        y: Math.random() * (game.screen_h + 50) - 50,
        xspeed: Math.random() * 5 + 5,
    });
}

function update_clouds(delta) {
    new_cloud_timer += delta;
    while (new_cloud_timer > CLOUD_INTERVAL) {
        make_cloud(-50);
        new_cloud_timer -= CLOUD_INTERVAL;
    }

    for (let c of clouds) {
        c.x += c.xspeed * delta / 1000;
        if (c.x >= game.screen_w) {
            c.deleteme = true;
        }
    }

    clouds = clouds.filter(c => !c.deleteme);
}

const CHAR_MOVE_SPEED = 3;
const CHAR_FLY_SPEED = 1.5;

let all_keys_off = false;

function move_char(delta) {
    if (game_state === State.STAND) {
        if (arrows.length === 0) {
            all_keys_off = true;
        } else {
            let dir = arrows[arrows.length - 1];
            switch (dir) {
                case 'left':
                    do_move(-1, 0);
                    break;
                case 'right':
                    do_move(1, 0);
                    break;
                case 'up':
                    do_move(0, -1);
                    break;
                case 'down':
                    do_move(0, 1);
                    break;
            }
        }
    } else if (game_state === State.HOP) {
        character.move_fraction += delta / 1000 * CHAR_MOVE_SPEED;
        if (character.move_fraction >= 1) {
            complete_char_move();
        }
        for (let f of fans) {
            f.move_fraction = character.move_fraction;
        }
        update_fan_wind_columns();
    } else if (game_state === State.FLY) {
        character.move_fraction += delta / 1000 * CHAR_FLY_SPEED;
        if (character.move_fraction >= 1) {
            complete_char_move();
        } else if (character.move_fraction >= 0.5 && !character.flying_into_wind) {
            if (character.anim !== 'flap') {
                game.sfx.flap.play();
                set_anim(character, 'flap');
            }
        }
    }
}

function check_victory() {
    for (let m of mailboxes) {
        if (m.anim !== 'closed') {
            return;
        }
    }
    win();
}

let message_alpha = 0;
const MESSAGE_FADE_TIME = 1000;

function win() {
    game.music.ingame.pause();
    game.music.pigeonwin.play();
    game_state = State.WIN;
    set_anim(character, 'stand');
    save();
}

function complete_char_move() {
    character.x = character.target_x;
    character.y = character.target_y;
    character.move_fraction = 0;

    if (character.x < 0 || character.x >= game.level_w || character.y < 0 || character.y >= game.level_h) {
        game_state = State.LOST;
        game.music.ingame.pause();
        game.music.pigeonfail.play();
        return;
    } else if (!can_land_on(character.x, character.y) && character.futile) {
        set_anim(character, 'explode');
        character.variant = Dir.DOWN;
        game_state = State.FAIL;
        game.music.ingame.pause();
        game.music.pigeonfail.play();
        return;
    }

    for (let f of fans) {
        if (f.target_x !== f.x || f.target_y !== f.y) {
            for (let w of f.wind) {
                w.deleteme = true;
            }
            wind = wind.filter(w => !w.deleteme);
            animatable_things = animatable_things.filter(t => !t.deleteme);
            f.wind = f.new_wind;
            f.new_wind = [];
            for (let w of f.wind) {
                w.box.x = 0;
                w.box.y = 0;
                w.box.w = game.tile_size;
                w.box.h = game.tile_size;
            }
            f.x = f.target_x;
            f.y = f.target_y;
        }
    }
    if (wind_at(character.x, character.y).length > 0) {
        let windy = wind_at(character.x, character.y);
        let wind_dir = null;
        if (windy.length === 1) {
            wind_dir = windy[0].variant;
        } else {
            /* Handle tiles with multiple wind directions */
            let dx = 0, dy = 0;
            for (let w of windy) {
                switch (w.variant) {
                    case Dir.UP:
                        dy --;
                        break;
                    case Dir.DOWN:
                        dy ++;
                        break;
                    case Dir.LEFT:
                        dx --;
                        break;
                    case Dir.RIGHT:
                        dx ++;
                        break;
                }
            }
            switch (character.variant) {
                /* Cancel out wind blowing parallel to us */
                case Dir.UP:
                case Dir.DOWN:
                    if (dy !== 0) dy = 0;
                    break;
                case Dir.LEFT:
                case Dir.RIGHT:
                    if (dx !== 0) dx = 0;
                    break;
            }
            if (dy === 0) {
                if (dx > 0) {
                    wind_dir = Dir.RIGHT;
                } else if (dx < 0) {
                    wind_dir = Dir.LEFT;
                } else {
                    /* keep going i guess? */
                    wind_dir = character.variant;
                }
            } else if (dx === 0) {
                if (dy > 0) {
                    wind_dir = Dir.DOWN;
                } else if (dy < 0) {
                    wind_dir = Dir.UP;
                }
            }
        }

        /* Get blown in a different direction! Exciting! */
        game.sfx.whoosh.play();
        switch (wind_dir) {
            case Dir.UP:
                do_fly(0, -1, true);
                break;
            case Dir.DOWN:
                do_fly(0, 1, true);
                break;
            case Dir.LEFT:
                do_fly(-1, 0, true);
                break;
            case Dir.RIGHT:
                do_fly(1, 0, true);
                break;
        }
    } else {
        if (character.anim === 'flap') {
            game.sfx.alight.play();
        }
        set_anim(character, 'stand');
        game_state = State.STAND;
    }
}

function update_anims(delta) {
    for (let thing of animatable_things) {
        thing.anim_timer += delta;
        while (thing.anim_timer > thing.anims[thing.anim][thing.frame][1]) {
            thing.anim_timer -= thing.anims[thing.anim][thing.frame][1];
            if (Object.keys(thing.anims).includes(thing.anim + 'd')) {
                thing.frame ++;
                if (thing.frame >= thing.anims[thing.anim].length - 1) {
                    set_anim(thing, thing.anim + 'd');
                    /* Maybe this is a mailbox that just closed, so check if all mailboxes are closed */
                    check_victory();
                }
            } else {
                thing.frame ++;
                thing.frame = zb.mod(thing.frame, thing.anims[thing.anim].length);
            }
        }
    }
}

/* DRAW */
function do_draw(ctx) {
    ctx.fillStyle = game.background_color;

    ctx.beginPath();
    ctx.rect(0, 0, game.screen_w, game.screen_h);
    ctx.fill();

    draw_clouds(ctx);

    if (wonitall) {
        zb.screen_draw(ctx, game.img.win);
        return;
    }

    if (intitle) {
        zb.screen_draw(ctx, game.img.title);
        return;
    }

    draw_map(ctx);

    draw_level_image(ctx);

    /* Sort objects and draw */
    animatable_things.sort((a, b) => {
        if (a.is_wind && !b.is_wind) {
            return -1;
        }
        if (b.is_wind && !a.is_wind) {
            return 1;
        }

        let amf = a.move_fraction || 0;
        let atx = a.target_x || a.x;
        let aty = a.target_y || a.y;

        let bmf = b.move_fraction || 0;
        let btx = b.target_x || b.x;
        let bty = b.target_y || b.y;

        return (a.y * (1 - amf) + aty * amf) - (b.y * (1 - bmf) + bty * bmf);
    });

    for (let thing of animatable_things) {
        if (thing !== character) {
            draw_thing(ctx, thing);
        } else {
            draw_character(ctx);
        }
    }

    draw_message(ctx);
}

function draw_clouds(ctx) {
    for (let c of clouds) {
        ctx.drawImage(game.img.cloud, c.x, c.y);
    }
}

function draw_map(ctx) {
    for (let y = 0; y < game.level_h; y++) {
        for (let x = 0; x < game.level_w; x++) {
            let tile_id = map[y * game.level_w + x];
            zb.sprite_draw(ctx, game.img.tiles, game.tile_size, game.tile_size, tile_id, tile_animation_frame, x * game.tile_size, y * game.tile_size);
        }
    }
}

function draw_level_image(ctx) {
    if (game.img.levelimages.hasOwnProperty(level_number)) {
        zb.screen_draw(ctx, game.img.levelimages[level_number]);
    }
}

function draw_thing(ctx, thing) {
    let x = thing.x;
    let y = thing.y;
    let tx = thing.target_x || x;
    let ty = thing.target_y || y;

    let variant = thing.variant || 0;
    let xo = thing.sprite.x_offset || 0;
    let yo = thing.sprite.y_offset || 0;
    let w = thing.sprite.w || game.tile_size;
    let h = thing.sprite.h || game.tile_size;
    let mf = thing.move_fraction || 0;

    let bx = 0, by = 0, bw = w, bh = h;
    if (thing.box) {
        if (thing.box.x !== undefined) {
            bx = thing.box.x;
        }
        if (thing.box.y !== undefined) {
            by = thing.box.y;
        }
        if (thing.box.w !== undefined) {
            bw = thing.box.w;
        }
        if (thing.box.h !== undefined) {
            bh = thing.box.h;
        }
    }

    if (bw > 0 || bh > 0) {
        ctx.drawImage(game.img[thing.sprite.img], thing.variant * w + bx, thing.anims[thing.anim][thing.frame][0] * h + by, bw, bh,
            Math.round((x * (1 - mf) + tx * mf) * game.tile_size) - xo + bx, Math.round((y * (1 - mf) + ty * mf) * game.tile_size) - yo + by, bw, bh);
    }
}

function draw_character(ctx) {
    let x = character.x;
    let y = character.y;
    let tx = character.target_x || x;
    let ty = character.target_y || y;

    let variant = character.variant || 0;
    let xo = character.sprite.x_offset || 0;
    let yo = character.sprite.y_offset || 0;
    let w = character.sprite.w || game.tile_size;
    let h = character.sprite.h || game.tile_size;
    let mf = character.move_fraction || 0;

    if (game_state === State.FLY) {
        /* swoop */
        /* fancy lagrange polynomial */
        let swoopmf = mf;
        if (character.flying_into_wind) {
            swoopmf *= 0.75;
        }
        yo += -440 * swoopmf * (swoopmf - 0.25) * (swoopmf - 0.75) * (swoopmf - 1);
        if (character.flying_into_wind) {
            mf = 1 - Math.pow(1 - mf, 1.1);
        } else {
            mf = 1 - Math.pow(1 - mf, 1.7);
        }
    }

    zb.sprite_draw(ctx, game.img[character.sprite.img], w, h, character.variant, character.anims[character.anim][character.frame][0],
        Math.round((x * (1 - mf) + tx * mf) * game.tile_size) - xo, Math.round((y * (1 - mf) + ty * mf) * game.tile_size) - yo);
}

function draw_message(ctx) {
    ctx.save();

    ctx.globalAlpha = message_alpha;

    if (game_state === State.WIN) {
        zb.screen_draw(ctx, game.img.complete);
    } else if (game_state === State.FAIL || game_state === State.LOST) {
        zb.screen_draw(ctx, game.img.failed);
    }

    ctx.restore();
}

let arrows = [];

function handle_keydown(game, e) {
    if (e.repeat) return;

    if (wonitall) return;

    if (all_keys_off && (game_state === State.WIN || intitle) && e.key !== 'z' && e.key !== 'r') {
        advance_level();
        return;
    }

    switch (e.key) {
        case 'ArrowLeft':
            if (!arrows.includes('left') || character.variant !== Dir.LEFT) {
                if (game_state === State.STAND && check_fly(-1, 0)) {
                    /* Check if we can flyyy */
                    do_fly(-1, 0);
                    break;
                }
            }
            if (!arrows.includes('left')) {
                arrows.push('left');
            }
            break;
        case 'ArrowRight':
            if (!arrows.includes('right') || character.variant !== Dir.RIGHT) {
                if (game_state === State.STAND && check_fly(1, 0)) {
                    /* Check if we can flyyy */
                    do_fly(1, 0);
                    break;
                }
            }
            if (!arrows.includes('right')) {
                arrows.push('right');
            }
            break;
        case 'ArrowUp':
            if (!arrows.includes('up') || character.variant !== Dir.UP) {
                if (game_state === State.STAND && check_fly(0, -1)) {
                    /* Check if we can flyyy */
                    do_fly(0, -1);
                    break;
                }
            }
            if (!arrows.includes('up')) {
                arrows.push('up');
            }
            break;
        case 'ArrowDown':
            if (!arrows.includes('down') || character.variant !== Dir.DOWN) {
                if (game_state === State.STAND && check_fly(0, 1)) {
                    /* Check if we can flyyy */
                    do_fly(0, 1);
                    break;
                }
            }
            if (!arrows.includes('down')) {
                arrows.push('down');
            }
            break;
    }
}

let x_pressed = false;
function handle_keyup(game, e) {
    switch (e.key) {
        case 'ArrowLeft':
            arrows = arrows.filter(a => a != 'left');
            break;
        case 'ArrowRight':
            arrows = arrows.filter(a => a != 'right');
            break;
        case 'ArrowUp':
            arrows = arrows.filter(a => a != 'up');
            break;
        case 'ArrowDown':
            arrows = arrows.filter(a => a != 'down');
            break;
        case 'm':
            game.toggle_mute();
            e.preventDefault();
            break;
        case 'r':
            reset();
            e.preventDefault();
            break;
        case 'z':
            undo();
            e.preventDefault();
            break;
        case 'x':
            x_pressed = true;
            break;
        case 'w':
            if (x_pressed) {
                delete_save();
                e.preventDefault();
            }
            break;
    }

    if (e.keyCode !== 88) {
        /* non-X key */
        x_pressed = false;
    }
}

function handle_mouseup(game) {
    if (game_state === State.WIN || wonitall || intitle) {
        advance_level();
        return;
    }
}
