#!/usr/bin/python3

import ulvl
import sys

if len(sys.argv) < 2:
    print("usage:", sys.argv[0], "<infiles>")
    sys.exit(1)

screenwidth, screenheight = 16, 12

tilemapping = { 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 6 }

objmapping = { }

print("var levels={")
for filename in sys.argv[1:]:
    m = ulvl.TMX.load(filename)

    w = m.meta['width']
    h = m.meta['height']

    print('\t', filename.replace('.tmx', '').replace('levels/', ''), end=': { ')

    fans = [ ]
    mailboxes = [ ]
    startpt = (0, 0)

    print('map: [', end='')
    for y in range(h):
        for x in range(w):
            thing = m.layers[0].tiles[y * w + x] - 1
            if thing == 6:
                fans.append({ 'x': x, 'y': y, 'dir': 'up' })
            elif thing == 7:
                fans.append({ 'x': x, 'y': y, 'dir': 'down' })
            elif thing == 8:
                fans.append({ 'x': x, 'y': y, 'dir': 'right' })
            elif thing == 9:
                fans.append({ 'x': x, 'y': y, 'dir': 'left' })
            elif thing == 10:
                startpt = (x, y)
            elif thing == 11:
                mailboxes.append({ 'x': x, 'y': y })

            print(tilemapping.get(thing, thing), ",", end='')
    print('],');

    print('fans: [', end='')
    for f in fans:
        print('{ x:', f['x'], ', y:', f['y'], ', dir: "' + f['dir'] + '" }, ', end='')

    print('],', end='')

    print('mailboxes: [', end='')
    for m in mailboxes:
        print('{ x:', m['x'], ', y:', m['y'], end=' }, ')

    print('],', end='')

    print('start_x:', startpt[0], ', start_y:', startpt[1], end=', ')

    print(' },')

print("}")
