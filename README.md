
#  The Maddness

### What if you could change the rules of chess while playing it?

The Maddness is a two-player chess game where the rules aren't necessarily fixed.

Instead of playing an entire match under the same set of predefined rules, players can introduce changes to the game's mechanics while the match is still in progress.

The idea is simple: **play chess, but make the rules part of the strategy.**

## 💡 The Idea

A match begins as a completely normal game of chess. Both players start with the standard pieces, board, and movement rules.

However, alongside making their regular chess moves, players have the ability to modify the rules governing the game.

Want to give your knight the ability to move like a queen? You can.

Want to introduce a completely new movement pattern for a bishop? You can propose that too.

The possibilities depend on the rules and capabilities supported by the game.

These modifications are submitted as programmable rulesets, which are validated before becoming active in the match.

## 🎮 How It Works

Imagine the following match:

**1. The game begins**

Two players start a normal chess match. All pieces behave according to standard chess rules.

**2. A player decides to change something**

After a few moves, Player A decides that their knights should gain an additional ability.

They modify the knight's movement rules so that it can move in its usual L-shaped pattern, but can also move like a queen.

**3. The new rules are submitted**

Player A submits the modified ruleset.

The game validates the proposed changes. If the ruleset is valid, it becomes active in the ongoing match.

The board position doesn't reset, and the game continues under the updated rules.

**4. The opponent adapts**

Player B receives a notification that the rules have changed.

They can inspect the modified rules, understand what has changed, and decide how to respond.

They might introduce a modification of their own to counter Player A's advantage.

**5. The game evolves**

As the match progresses, both players can continue proposing changes.

The game becomes more than just a battle of moves. It becomes a battle of creativity, strategy, and understanding the rules themselves.

##  The Interesting Part

One of the things I find particularly interesting about this idea is that players aren't necessarily required to make their rulesets easy to understand.

A player could create a perfectly valid ruleset with complicated combinations of movement patterns and conditions.

Their opponent would have to investigate the rules, understand their implications, and figure out how to play against them.

This introduces another layer of strategy:

- Can you create a rule that gives you an advantage?
- Can you understand your opponent's modifications before they exploit them?
- Can you create a counter-rule that changes the balance of the game?
- Can you predict how the game will evolve after a particular modification?

The rules themselves become part of the competition.

## ⚙️ The Vision

I envision a game where players have considerable freedom to experiment with chess mechanics while still operating within a controlled set of supported capabilities.

Some possibilities for the future include:

- Modifying how existing chess pieces move.
- Combining multiple movement patterns.
- Introducing new pieces with custom abilities.
- Modifying certain game mechanics.
- Experimenting with entirely new win conditions.
- Creating increasingly complex rulesets.

The goal isn't necessarily to preserve traditional chess. It's to explore what happens when players are given the ability to reshape the game they're playing.

##  An Important Distinction

The Maddness is about programmable **game rules**, not unrestricted execution of arbitrary code.

Players should be able to create complex and unconventional rule definitions, but those definitions must remain within the capabilities supported by the game engine.

Every proposed change must be validated before it can affect the ongoing match.

This ensures that creativity and experimentation don't compromise the integrity or security of the game.

##  Current Direction

The initial version will focus on two-player chess, starting with standard chess rules and gradually introducing programmable modifications.

The first major goal is to demonstrate that players can modify piece movement rules during an ongoing match without restarting the game.

From there, the possibilities can expand as the project evolves.

---

**The Maddness — Don't just play by the rules. Change them.**
