/** Small, independent examples of the client fields consumed by tools and checks. */
export const coreCsv: Record<string, string> = {
  QuestV2: "ID,UniqueBitFlag\n90001,42\n",
  QuestV2CliTask: "ID,QuestTitle_lang\n90001,A small adventure\n",
  QuestLine: "ID,Name_lang\n10,A new beginning\n",
  QuestLineXQuest: "ID,QuestLineID,QuestID,OrderIndex\n11,10,90001,0\n",
  Faction: "ID,Name_lang,ParentFactionID,Expansion\n72,Stormwind,0,0\n",
  ItemSparse: "ID,Display_lang\n19019,Thunderfury\n",
  Mount: "ID,Name_lang,SourceSpellID,SourceTypeEnum\n6,Brown Horse,458,1\n",
  BattlePetSpecies: "ID,CreatureID,SummonSpellID,PetTypeEnum,SourceTypeEnum\n39,7390,10695,1,1\n",
  Toy: "ID,ItemID,SourceTypeEnum\n1,1973,1\n",
  CurrencyTypes: "ID,Name_lang,MaxQty,MaxEarnablePerWeek\n2000,Test currency,100,10\n",
  Achievement:
    "ID,Title_lang,Description_lang,Instance_ID,Criteria_tree\n964,Going Down?,Fall,0,100\n",
  CriteriaTree:
    "ID,Parent,CriteriaID,OrderIndex,Amount,Operator,Description_lang\n100,0,101,0,1,0,Fall\n",
  Criteria: "ID,Type,Asset\n101,29,90001\n",
  UiMap: "ID,Name_lang,ParentUiMapID,Type\n84,Stormwind City,13,3\n",
  UiMapGroupMember: "ID,Name_lang,UiMapID\n1,Deadmines,291\n",
  UiMapAssignment:
    "ID,UiMapID,MapID,AreaID,Region_0,Region_1,Region_3,Region_4,UiMin_0,UiMin_1,UiMax_0,UiMax_1\n1,84,0,1519,0,0,100,100,0,0,1,1\n",
  AreaTable: "ID,AreaName_lang,ContinentID,ParentAreaID\n1519,Stormwind City,0,0\n",
  Map: "ID,MapName_lang,ParentMapID,ExpansionID,InstanceType\n0,Eastern Kingdoms,-1,0,0\n",
  QuestPOIBlob: "ID,QuestID,UiMapID,MapID,NumPoints\n200,90001,84,0,1\n",
  QuestPOIPoint: "ID,QuestPOIBlobID,X,Y\n201,200,25,75\n",
  TaxiNodes: "ID,Name_lang,ContinentID,Pos_0,Pos_1,Flags\n2,Stormwind,0,25,75,1\n",
  JournalInstance: "ID,Name_lang,MapID\n63,Deadmines,36\n",
  JournalEncounter:
    "ID,Name_lang,JournalInstanceID,DungeonEncounterID,OrderIndex,UiMapID,Map_0,Map_1\n1,A boss,63,2970,0,291,0.25,0.75\n",
};

export async function coreResponse(input: string | URL | Request): Promise<Response> {
  const url = new URL(String(input));
  const table = url.pathname.split("/")[2];
  const csv = coreCsv[table];
  if (!csv) throw new Error(`Unexpected source table: ${table}`);
  return new Response(csv);
}
