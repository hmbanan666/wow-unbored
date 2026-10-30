-- A Character file and an Account file as the game writes them
-- (docs/contract/README.md). Both globals are here so one fixture serves the
-- addon, Companion and Server tests; in the game they live in two files.
UnboredCharDB = {
	["data"] = {
		["schema"] = 2,
		["savedAt"] = 1761830400,
		["sections"] = {
			["char"] = {
				["v"] = 1,
				["at"] = 1761829000,
				["src"] = "login",
				["body"] = {
					["name"] = "Mira",
					["realm"] = "Silvermoon",
					["class"] = "Mage",
					["classFile"] = "MAGE",
					["classID"] = 8,
					["race"] = "Blood Elf",
					["raceFile"] = "BloodElf",
					["raceID"] = 10,
					["faction"] = "Horde",
					["level"] = 80,
					["xp"] = 0,
					["xpMax"] = 0,
					["specID"] = 63,
					["spec"] = "Fire",
					["heroSpecID"] = 39,
					["ilvl"] = 652.4,
					["money"] = 183420000,
					["hearth"] = "Dornogal",
					["inGuild"] = true,
				},
			},
			["gear"] = {
				["v"] = 1,
				["at"] = 1761829000,
				["src"] = "login",
				["body"] = {
					["ilvl"] = 652.4,
					["slots"] = {
						{
							["slot"] = 1,
							["itemID"] = 212065,
							["item"] = "item:212065::::::::80:63::3:5:10356:10372:1540:6652",
							["ilvl"] = 658,
						}, -- [1]
					},
				},
			},
			["bags"] = {
				["v"] = 1,
				["at"] = 1761829500,
				["src"] = "event",
				["body"] = {
					["slots"] = 146,
					["count"] = 2,
					["items"] = {
						"idv1", -- [1]
						"5d0:1,4dag:16", -- [2]
					},
					["gear"] = {
						"item:219331::::::::80:63::13:3:10354:1540:6652", -- [1]
					},
				},
			},
			["questsDone"] = {
				["v"] = 1,
				["at"] = 1761829010,
				["src"] = "login",
				["body"] = {
					["count"] = 387,
					["ids"] = {
						"ids1", -- [1]
						"k28,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,2,1,13td,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5", -- [2]
					},
				},
			},
			["questLog"] = {
				["v"] = 1,
				["at"] = 1761829500,
				["src"] = "event",
				["body"] = {
					["quests"] = {
						{
							["questID"] = 78713,
							["title"] = "The Weight of Duty",
							["level"] = 80,
							["complete"] = false,
							["tracked"] = true,
							["objectives"] = {
								{
									["text"] = "Speak to Moira",
									["done"] = false,
									["have"] = 0,
									["need"] = 1,
								}, -- [1]
							},
						}, -- [1]
					},
				},
			},
			["sessions"] = {
				["v"] = 1,
				["at"] = 1761830400,
				["src"] = "event",
				["body"] = {
					["list"] = {
						{
							["start"] = 1761828000,
							["stop"] = 1761830400,
							["zones"] = {
								"Dornogal", -- [1]
							},
							["maps"] = {
								{
									["mapID"] = 2339,
									["minutes"] = 40,
								}, -- [1]
							},
							["deaths"] = 1,
						}, -- [1]
					},
				},
			},
		},
	},
	["profile"] = {
		["v"] = 1,
		["character"] = "Mira",
		["realm"] = "Silvermoon",
		["savedAt"] = 1761830400,
		["context"] = {
			["mapID"] = 2339,
			["gold"] = 18342,
		},
		["bags"] = {
			{
				["itemID"] = 6948,
				["count"] = 1,
			}, -- [1]
		},
	},
}
UnboredDB = {
	["version"] = 1,
	["data"] = {
		["schema"] = 2,
		["savedAt"] = 1761830400,
		["sections"] = {
			["mounts"] = {
				["v"] = 1,
				["at"] = 1761829010,
				["src"] = "login",
				["body"] = {
					["count"] = 6,
					["total"] = 1400,
					["ids"] = {
						"ids1", -- [1]
						"6,1,4,e,1d3,az", -- [2]
					},
				},
			},
			["achievements"] = {
				["v"] = 1,
				["at"] = 1761829100,
				["src"] = "daily",
				["body"] = {
					["count"] = 7,
					["points"] = 12450,
					["scannedAt"] = 1761829100,
					["ids"] = {
						"ids1", -- [1]
						"6,1,1,1,1,32u,bww", -- [2]
					},
				},
			},
			["warband"] = {
				["v"] = 1,
				["at"] = 1761829300,
				["src"] = "window",
				["body"] = {
					["slots"] = 98,
					["count"] = 1,
					["items"] = {
						"idv1", -- [1]
						"4sux:3", -- [2]
					},
				},
			},
			["pets"] = {
				["v"] = 1,
				["at"] = 1761829010,
				["src"] = "login",
				["body"] = {
					["count"] = 3,
					["species"] = {
						"idv1", -- [1]
						"13:2:p:4,1:1:1:3", -- [2]
					},
				},
			},
			["futureThing"] = {
				["v"] = 3,
				["at"] = 1761829300,
				["src"] = "login",
				["body"] = {
					["anything"] = "kept raw",
				},
			},
		},
		["dropped"] = {
			["calendar"] = {
				["at"] = 1761829400,
				["bytes"] = 2048,
			},
		},
	},
}
